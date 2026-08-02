// Retro Arcade — Tennis lobby + AUTHORITATIVE match server.
// Online matches are simulated here (see match.js); browsers only send inputs
// and render snapshots, so the "rigging" perks — enabled per side from the
// server-validated `unlock` env var — cannot be forged by a client.
//
// client -> server
//   { t:'hello', name, key }        register; key validated against env.unlock
//   { t:'challenge', to } / { t:'accept', to } / { t:'decline', to }
//   { t:'input', dx, dy }           movement (own view; up = -1)
//   { t:'swing' }                   rally swing
//   { t:'serve', bias }             serve (bias used only if you're rigged)
//   { t:'restart' }                 restart after match-over
//   { t:'leave' }
// server -> client
//   { t:'welcome', id, rigged }
//   { t:'lobby', players:[{id,name,busy}] }
//   { t:'challenged', from, name } / { t:'declined', from }
//   { t:'start', side:'p1'|'p2', oppName }
//   { t:'state', data } (~30Hz)     { t:'oppLeft' }

const http = require('http');
const { WebSocketServer } = require('ws');
const { Match } = require('./match');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/unlock') {
    const ok = !!process.env.unlock && u.searchParams.get('key') === process.env.unlock;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Retro Arcade Tennis server is running.\n');
});

const wss = new WebSocketServer({ server });
const clients = new Map(); // id -> { id, ws, name, busy, peer, rigged, match, side }
let nextId = 1;

const send = (c, obj) => { if (c && c.ws.readyState === 1) c.ws.send(JSON.stringify(obj)); };
const lobbyList = () => [...clients.values()].map(c => ({ id: c.id, name: c.name, busy: c.busy }));
function broadcastLobby() {
  const msg = JSON.stringify({ t: 'lobby', players: lobbyList() });
  for (const c of clients.values()) if (c.ws.readyState === 1) c.ws.send(msg);
}

function startMatch(accepter, challenger) {
  const sim = new Match({
    p1: accepter.rigged && accepter.rigOn,
    p2: challenger.rigged && challenger.rigOn,
  });
  const m = { sim, players: { p1: accepter, p2: challenger }, interval: null };
  accepter.match = m; accepter.side = 'p1'; accepter.busy = true; accepter.peer = challenger.id;
  challenger.match = m; challenger.side = 'p2'; challenger.busy = true; challenger.peer = accepter.id;
  send(accepter, { t: 'start', side: 'p1', oppName: challenger.name });
  send(challenger, { t: 'start', side: 'p2', oppName: accepter.name });

  let acc = 0;
  m.interval = setInterval(() => {
    sim.tick(1 / 60);
    if (++acc >= 2) { // ~30Hz snapshots
      acc = 0;
      const snap = sim.snapshot();
      send(accepter, { t: 'state', data: snap });
      send(challenger, { t: 'state', data: snap });
    }
  }, 1000 / 60);
  broadcastLobby();
}

function endMatch(m, leaverId) {
  if (!m) return;
  clearInterval(m.interval);
  for (const side of ['p1', 'p2']) {
    const c = m.players[side];
    if (!c) continue;
    c.match = null; c.side = null; c.busy = false; c.peer = null;
    if (c.id !== leaverId) send(c, { t: 'oppLeft' });
  }
  broadcastLobby();
}

wss.on('connection', (ws) => {
  const id = nextId++;
  const client = { id, ws, name: 'Player ' + id, busy: false, peer: null, rigged: false, rigOn: true, match: null, side: null };
  clients.set(id, client);

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const sim = client.match && client.match.sim;

    switch (m.t) {
      case 'hello':
        client.name = (String(m.name || '').trim().slice(0, 16)) || ('Player ' + id);
        client.rigged = !!(process.env.unlock && m.key && m.key === process.env.unlock);
        client.rigOn = (m.rigOn === undefined) ? true : !!m.rigOn;
        send(client, { t: 'welcome', id, rigged: client.rigged });
        broadcastLobby();
        break;

      case 'rig':
        client.rigOn = !!m.on;
        if (sim && client.side) sim.rigged[client.side] = client.rigged && client.rigOn;
        break;

      case 'challenge': {
        const t = clients.get(m.to);
        if (t && !t.busy && !client.busy && t.id !== client.id) send(t, { t: 'challenged', from: id, name: client.name });
        break;
      }
      case 'accept': {
        const o = clients.get(m.to);
        if (o && !o.busy && !client.busy) startMatch(client, o); // accepter = p1
        break;
      }
      case 'decline': {
        const o = clients.get(m.to);
        if (o) send(o, { t: 'declined', from: id });
        break;
      }

      case 'input': if (sim) sim.setInput(client.side, m.dx, m.dy); break;
      case 'swing': if (sim) sim.onSwing(client.side); break;
      case 'serve': if (sim) sim.onServe(client.side, m.bias); break;
      case 'restart': if (sim && sim.over) sim.restart(); break;

      case 'leave':
        endMatch(client.match, client.id);
        break;
    }
  });

  ws.on('close', () => {
    endMatch(client.match, client.id);
    clients.delete(id);
    broadcastLobby();
  });
});

server.listen(PORT, () => console.log('Tennis server listening on ' + PORT));

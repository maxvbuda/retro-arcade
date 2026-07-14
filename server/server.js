// Retro Arcade — Tennis lobby + relay server.
// Deploy on Render (see ../render.yaml). Clients connect over WebSocket,
// register a name, see who else is online, challenge each other, and once a
// match starts every game message is relayed between the two peers.
//
// Message protocol (JSON both ways):
//   client -> server
//     { t:'hello', name }            register / rename
//     { t:'challenge', to:id }       invite another player
//     { t:'accept', to:id }          accept an invite (accepter becomes host)
//     { t:'decline', to:id }
//     { t:'msg', data }              relayed verbatim to your match peer
//     { t:'leave' }                  leave the current match
//   server -> client
//     { t:'welcome', id }
//     { t:'lobby', players:[{id,name,busy}] }
//     { t:'challenged', from:id, name }
//     { t:'declined', from:id }
//     { t:'start', role:'host'|'guest', oppName }
//     { t:'msg', data }
//     { t:'oppLeft' }

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  // Rigging unlock check: the secret lives only in the `unlock` env var here,
  // never in the client. GET /unlock?key=... -> { ok: true|false }
  if (u.pathname === '/unlock') {
    const ok = !!process.env.unlock && u.searchParams.get('key') === process.env.unlock;
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ ok }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Retro Arcade Tennis lobby server is running.\n');
});

const wss = new WebSocketServer({ server });
const clients = new Map(); // id -> { id, ws, name, busy, peer }
let nextId = 1;

function send(c, obj) {
  if (c && c.ws.readyState === 1) c.ws.send(JSON.stringify(obj));
}

function lobbyList() {
  return [...clients.values()].map(c => ({ id: c.id, name: c.name, busy: c.busy }));
}

function broadcastLobby() {
  const msg = JSON.stringify({ t: 'lobby', players: lobbyList() });
  for (const c of clients.values()) if (c.ws.readyState === 1) c.ws.send(msg);
}

function endMatch(client) {
  const peer = clients.get(client.peer);
  if (peer) {
    peer.busy = false;
    peer.peer = null;
    send(peer, { t: 'oppLeft' });
  }
  client.busy = false;
  client.peer = null;
}

wss.on('connection', (ws) => {
  const id = nextId++;
  const client = { id, ws, name: 'Player ' + id, busy: false, peer: null };
  clients.set(id, client);

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    switch (m.t) {
      case 'hello':
        client.name = (String(m.name || '').trim().slice(0, 16)) || ('Player ' + id);
        send(client, { t: 'welcome', id });
        broadcastLobby();
        break;

      case 'challenge': {
        const target = clients.get(m.to);
        if (target && !target.busy && !client.busy && target.id !== client.id) {
          send(target, { t: 'challenged', from: id, name: client.name });
        }
        break;
      }

      case 'accept': {
        const other = clients.get(m.to);
        if (other && !other.busy && !client.busy) {
          client.busy = other.busy = true;
          client.peer = other.id;
          other.peer = client.id;
          // The player who ACCEPTS runs the authoritative simulation (host).
          send(client, { t: 'start', role: 'host', oppName: other.name });
          send(other, { t: 'start', role: 'guest', oppName: client.name });
          broadcastLobby();
        }
        break;
      }

      case 'decline': {
        const other = clients.get(m.to);
        if (other) send(other, { t: 'declined', from: id });
        break;
      }

      case 'msg': {
        const peer = clients.get(client.peer);
        if (peer) send(peer, { t: 'msg', data: m.data });
        break;
      }

      case 'leave':
        endMatch(client);
        broadcastLobby();
        break;
    }
  });

  ws.on('close', () => {
    endMatch(client);
    clients.delete(id);
    broadcastLobby();
  });
});

server.listen(PORT, () => console.log('Tennis lobby server listening on ' + PORT));

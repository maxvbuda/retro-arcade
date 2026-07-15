// Headless, authoritative tennis simulation for online matches.
// The server owns all game state; clients only send inputs and render
// snapshots, so rigging perks (decided here from a server-validated unlock)
// cannot be forged by a browser.
//
// Sides: 'p1' is the near/bottom baseline, 'p2' the far/top. Player 1 is
// whoever ACCEPTED the challenge; player 2 is the challenger. Each client
// renders itself at the bottom (client flips the view for p2).

const courtLeft = 60, courtRight = 360, courtTop = 50, courtBottom = 470;
const netY = (courtTop + courtBottom) / 2;
const courtCX = (courtLeft + courtRight) / 2;

const REACH = 42, MAX_REACH_Z = 90;
const GRAVITY = 560, NET_HEIGHT = 24;
const MOVE_SPEED = 190;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const other = (s) => (s === 'p1' ? 'p2' : 'p1');

class Match {
  constructor(rigged) {
    // rigged: { p1: bool, p2: bool } — server-validated unlock per side
    this.rigged = { p1: !!(rigged && rigged.p1), p2: !!(rigged && rigged.p2) };
    this.input = { p1: { dx: 0, dy: 0 }, p2: { dx: 0, dy: 0 } };
    this.ball = { x: courtCX, y: courtBottom - 45, z: 45, vx: 0, vy: 0, vz: 0, shot: 'normal' };
    this.p1 = { x: courtCX, y: courtBottom - 30, swing: 0 };
    this.p2 = { x: courtCX, y: courtTop + 55, swing: 0 };
    this.points = { p1: 0, p2: 0 };
    this.games = { p1: 0, p2: 0 };
    this.server = 'p1';
    this.serveAttempt = 1;
    this.servePending = false;
    this.bounceCount = 0;
    this.lastHitter = null;
    this.state = 'point-pause';
    this.msg = 'GET READY!';
    this.timer = null; // scheduled transition
    this._t = 0;
    this.newMatch();
  }

  ent(side) { return side === 'p1' ? this.p1 : this.p2; }

  // ---- lifecycle -------------------------------------------------------
  schedule(delay, fn) {
    this._pending = { at: this._t + delay, fn };
  }
  newMatch() {
    this.points = { p1: 0, p2: 0 };
    this.games = { p1: 0, p2: 0 };
    this.server = 'p1';
    this.p1.x = courtCX; this.p1.y = courtBottom - 30;
    this.p2.x = courtCX; this.p2.y = courtTop + 55;
    this.state = 'point-pause';
    this.msg = 'GET READY!';
    this.schedule(1.2, () => this.startServe());
  }
  startServe() {
    this.serveAttempt = 1;
    this.servePending = false;
    this.beginServe();
  }
  beginServe() {
    this.state = 'serving';
    const srv = this.ent(this.server);
    this.ball.x = srv.x;
    this.ball.y = this.server === 'p1' ? srv.y - 15 : srv.y + 15;
    this.ball.z = 45; this.ball.vx = this.ball.vy = this.ball.vz = 0;
    this.msg = (this.server === 'p1' ? 'P1' : 'P2') + ' to serve';
    this.serveWait = 0;
  }

  // ---- inputs from clients --------------------------------------------
  setInput(side, dx, dy) {
    if (side !== 'p1' && side !== 'p2') return;
    this.input[side].dx = clamp(dx || 0, -1, 1);
    this.input[side].dy = clamp(dy || 0, -1, 1);
  }
  onServe(side, bias) {
    if (this.state !== 'serving' || side !== this.server) return;
    this.serveBias = this.rigged[side] ? clamp(bias || 0, -1, 1)
      : (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.4);
    this.doHit(side, true);
  }
  onSwing(side) {
    if (this.state !== 'rally' || side === this.lastHitter) return;
    const e = this.ent(side);
    const dist = Math.hypot(this.ball.x - e.x, this.ball.y - e.y);
    if (dist <= REACH && this.ball.z <= MAX_REACH_Z) this.doHit(side, false);
  }

  // ---- shot selection --------------------------------------------------
  shotTarget(side, xBias, depth) {
    const halfW = (courtRight - courtLeft) / 2 - 25;
    const tx = clamp(courtCX + xBias * halfW * (0.55 + Math.random() * 0.35), courtLeft + 15, courtRight - 15);
    let ty;
    if (side === 'p1') { // aiming into p2's (top) court
      if (depth === 'short') ty = netY - 35 - Math.random() * 20;
      else if (depth === 'deep') ty = courtTop + 20 + Math.random() * 15;
      else ty = courtTop + 55 + Math.random() * 70;
    } else {
      if (depth === 'short') ty = netY + 35 + Math.random() * 20;
      else if (depth === 'deep') ty = courtBottom - 20 - Math.random() * 15;
      else ty = courtBottom - 55 - Math.random() * 70;
    }
    return { x: tx, y: ty };
  }
  rallyAim(side) {
    const e = this.ent(side);
    // timing-based aim, mirrored for the far side
    let timingErr, xBias;
    if (side === 'p1') { timingErr = clamp((this.ball.y - e.y) / REACH, -1.2, 1.2); xBias = clamp(-timingErr * 1.3, -1, 1); }
    else { timingErr = clamp((e.y - this.ball.y) / REACH, -1.2, 1.2); xBias = clamp(timingErr * 1.3, -1, 1); }
    let depth = 'normal';
    const dy = this.input[side].dy;
    if (dy < -0.3) depth = (side === 'p1') ? 'deep' : 'short';
    else if (dy > 0.3) depth = (side === 'p1') ? 'short' : 'deep';
    return this.shotTarget(side, xBias, depth);
  }

  doHit(side, isServe) {
    const hitter = this.ent(side);
    this.servePending = isServe ? true : (side !== this.server ? false : this.servePending);
    this.bounceCount = 0;
    this.lastHitter = side;

    let target = isServe ? this.shotTarget(side, this.serveBias, 'deep') : this.rallyAim(side);

    // RIGGING: opponent shots go straight to the rigged player.
    const opp = other(side);
    if (this.rigged[opp]) {
      const t = this.ent(opp);
      target.x = clamp(t.x, courtLeft + 15, courtRight - 15);
      target.y = clamp(t.y, opp === 'p1' ? netY + 25 : courtTop + 20, opp === 'p1' ? courtBottom - 15 : netY - 25);
    }

    // classify
    const incoming = this.ball.shot;
    let T, shot;
    if (isServe) { T = 1.05; shot = 'normal'; }
    else if (this.rigged[side]) { shot = 'slam'; T = 0.42; } // RIGGING: always slam
    else {
      const d = Math.hypot(this.ball.x - hitter.x, this.ball.y - hitter.y);
      const q = clamp(1 - d / REACH, 0, 1);
      if (incoming === 'lob' && q > 0.35 && this.ball.z > 50) { shot = 'slam'; T = 0.42; }
      else if (q < 0.1) { shot = 'lob'; T = 1.5; }
      else { shot = 'normal'; T = this.rallyFlightTime(hitter); }
    }
    this.ball.shot = shot;

    const contactZ = shot === 'slam' ? 58 : (shot === 'lob' ? 16 : 30);
    this.ball.x = hitter.x;
    this.ball.y = hitter.y + (side === 'p1' ? -14 : 14);
    this.ball.z = contactZ;
    if (shot === 'slam') {
      target.y = side === 'p1' ? courtTop + 22 + Math.random() * 22 : courtBottom - 22 - Math.random() * 22;
    }
    this.applyShot(target, T, this.ball.z);
    hitter.swing = 1;
    this.sfx = { n: 'hit', shot }; // one-shot for clients
    this.state = 'rally';
  }

  rallyFlightTime(hitter) {
    const dist = Math.hypot(this.ball.x - hitter.x, this.ball.y - hitter.y);
    const q = clamp(1 - dist / REACH, 0, 1);
    return 1.2 - q * 0.35;
  }
  applyShot(target, T, z0) {
    this.ball.vx = (target.x - this.ball.x) / T;
    this.ball.vy = (target.y - this.ball.y) / T;
    this.ball.vz = (0.5 * GRAVITY * T * T - z0) / T;
  }

  // ---- scoring ---------------------------------------------------------
  pointsDisplay() {
    const p = this.points.p1, c = this.points.p2, n = ['0', '15', '30', '40'];
    if (p >= 3 && c >= 3) { if (p === c) return 'DEUCE'; return p > c ? 'AD P1' : 'AD P2'; }
    return n[Math.min(p, 3)] + '-' + n[Math.min(c, 3)];
  }
  checkSetWin() {
    const a = this.games.p1, b = this.games.p2;
    if ((a >= 4 && a - b >= 2) || a === 5) return 'p1';
    if ((b >= 4 && b - a >= 2) || b === 5) return 'p2';
    return null;
  }
  handleFault(hitterSide, cause) {
    this.sfx = { n: cause === 'NET' ? 'net' : 'bounce' };
    if (this.servePending && hitterSide === this.server) {
      if (this.serveAttempt === 1) {
        this.serveAttempt = 2;
        this.msg = 'FAULT (' + cause + ') — 2nd serve';
        this.state = 'point-pause';
        this.schedule(0.9, () => this.beginServe());
      } else {
        this.msg = 'DOUBLE FAULT';
        this.awardPoint(other(this.server));
      }
    } else {
      this.awardPoint(other(hitterSide), cause);
    }
  }
  handleBounce(x, y) {
    if (this.bounceCount === 0) {
      const inBounds = x >= courtLeft - 2 && x <= courtRight + 2 && y >= courtTop - 2 && y <= courtBottom + 2;
      if (!inBounds) { this.handleFault(this.lastHitter, 'OUT'); return; }
      if (this.servePending) this.servePending = false;
      this.bounceCount = 1;
      return;
    }
    this.bounceCount++;
    this.awardPoint(this.lastHitter, 'WINNER');
  }
  awardPoint(winner, reason) {
    this.state = 'point-pause';
    this.points[winner]++;
    this.sfx = { n: 'point', winner };
    const o = other(winner);
    const diff = this.points[winner] - this.points[o];
    const prefix = reason ? reason + ' — ' : '';
    if (this.points[winner] >= 4 && diff >= 2) {
      this.msg = prefix + (winner === 'p1' ? 'P1 WINS GAME' : 'P2 WINS GAME');
      this.schedule(1.5, () => this.onGameWon(winner));
    } else {
      this.msg = prefix + this.pointsDisplay();
      this.schedule(1.1, () => this.startServe());
    }
  }
  onGameWon(winner) {
    this.games[winner]++;
    this.points = { p1: 0, p2: 0 };
    const setW = this.checkSetWin();
    if (setW) {
      this.state = 'match-over';
      this.msg = (setW === 'p1' ? 'P1 WINS THE MATCH' : 'P2 WINS THE MATCH');
      this.over = true;
      return;
    }
    this.server = other(this.server);
    this.schedule(1.0, () => this.startServe());
  }

  // ---- tick ------------------------------------------------------------
  movePlayer(side, dt) {
    const e = this.ent(side);
    // p2's client view is flipped, so its input axes are negated in world space
    const mul = side === 'p1' ? 1 : -1;
    let dx = this.input[side].dx * mul, dy = this.input[side].dy * mul;
    if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
    e.x = clamp(e.x + dx * MOVE_SPEED * dt, courtLeft - 20, courtRight + 20);
    if (side === 'p1') e.y = clamp(e.y + dy * MOVE_SPEED * dt, netY + 15, courtBottom + 20);
    else e.y = clamp(e.y + dy * MOVE_SPEED * dt, courtTop - 20, netY - 15);
  }
  ballPhysics(dt) {
    const prevY = this.ball.y;
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;
    this.ball.vz -= GRAVITY * dt;
    this.ball.z += this.ball.vz * dt;
    if ((prevY - netY) * (this.ball.y - netY) < 0 && this.ball.z < NET_HEIGHT) {
      this.handleFault(this.lastHitter, 'NET');
      return;
    }
    if (this.ball.z <= 0 && this.ball.vz < 0) {
      this.ball.z = 0;
      this.sfx = { n: 'bounce' };
      this.handleBounce(this.ball.x, this.ball.y);
      if (this.state === 'rally') {
        this.ball.vz = -this.ball.vz * 0.55;
        if (Math.abs(this.ball.vz) < 60) this.ball.vz = 0;
      }
    }
  }
  tick(dt) {
    this._t += dt;
    if (this._pending && this._t >= this._pending.at) {
      const fn = this._pending.fn; this._pending = null; fn();
    }
    if (this.state === 'match-over') return;

    this.p1.swing = Math.max(0, this.p1.swing - dt / 0.26);
    this.p2.swing = Math.max(0, this.p2.swing - dt / 0.26);
    this.movePlayer('p1', dt);
    this.movePlayer('p2', dt);

    if (this.state === 'serving') {
      // fallback auto-serve if a player stalls
      this.serveWait = (this.serveWait || 0) + dt;
      if (this.serveWait > 6) this.onServe(this.server, 0);
    } else if (this.state === 'rally') {
      this.ballPhysics(dt);
    }
  }

  restart() { this.over = false; this.newMatch(); }

  snapshot() {
    const s = {
      k: 'S',
      b: [round(this.ball.x), round(this.ball.y), round(this.ball.z)], bs: this.ball.shot,
      p1: [round(this.p1.x), round(this.p1.y), round2(this.p1.swing)],
      p2: [round(this.p2.x), round(this.p2.y), round2(this.p2.swing)],
      st: this.state, sv: this.server,
      pt: [this.points.p1, this.points.p2], gm: [this.games.p1, this.games.p2],
      mg: this.msg,
    };
    if (this.sfx) { s.sfx = this.sfx; this.sfx = null; }
    return s;
  }
}

function round(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }

module.exports = { Match };

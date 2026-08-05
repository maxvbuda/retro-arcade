# Retro Arcade

A retro browser arcade — classic games rebuilt in plain HTML5 Canvas + JavaScript, no dependencies, no build step.

## Play

Open `index.html`, or serve the folder and visit it locally:

```bash
python3 -m http.server 8000
```

Then go to `http://localhost:8000`.

## Games

- **Snake** — eat, grow, don't bite yourself.
- **Pong** — you vs. the CPU, first to 7 wins.
- **Breakout** — smash every brick, don't drop the ball.
- **Tetris** — stack the blocks, clear the lines.
- **Space Invaders** — defend Earth across escalating waves.
- **Pac-Man** — clear a freshly generated maze every game, dodge four ghosts with distinct chase behaviors, and hunt them back down with power pellets.
- **Tennis** — rally against the CPU with real serve/fault rules, deuce scoring, directional timing-aim, lobs and slams; first to 4 games wins the match. Also has an **Online** mode: enter a name, see who else is in the lobby, and challenge a friend.
- **Cursed Cursor** — click the target with a pointer that's actively sabotaged: inverted axes, lag, drift, spin, jitter and momentum stack as your score climbs, and the cursor itself renders as a glitchy, broken arrow.

## Stack

Vanilla HTML/CSS/JS. No frameworks, no build tools — every game is a single self-contained `.html` file under `games/`.

## Online tennis (multiplayer)

The tennis lobby needs a small WebSocket server (in `server/`), deployable on
Render via `render.yaml`:

1. Deploy the repo to Render (it picks up `render.yaml`) or run `cd server && npm install && npm start` locally.
2. Copy the server's URL and set `NET_URL` near the top of the netplay block in `tennis.html` (e.g. `wss://your-app.onrender.com`, or `ws://localhost:3000` for local testing).

Online matches are **server-authoritative**: the Render server runs the match
simulation (`server/match.js`); both browsers are thin clients that send inputs
and render the streamed state. Because the game runs on the server, the rigging
perks — enabled per side from the server-validated `unlock` key — cannot be
forged in an online match. (Single-player still runs in the browser and is not
protected.)

The **website stays on GitHub Pages** (`maxvbuda.github.io/retro-arcade/`, with
tennis at `/retro-arcade/tennis.html`). Render only hosts the multiplayer
**API** (the WebSocket lobby server); the two are wired together purely by the
`NET_URL` the page connects to.

### Rigging unlock (`unlock` env var)

The tennis "rigging" perks are gated per-device. Set an env var named
**`unlock`** on the Render service to any secret value. Then visit
`tennis.html?unlock=<that value>` — the page asks the server to validate the
key against the env var (the secret is never in the page source) and, if it
matches, remembers the unlock in that browser's `localStorage`. Visit
`tennis.html?lock` to remove it. Because the rig behaviour still runs in the
browser, this hides/pins the perk but isn't fully cheat-proof.

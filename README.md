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

## Stack

Vanilla HTML/CSS/JS. No frameworks, no build tools — every game is a single self-contained `.html` file under `games/`.

## Online tennis (multiplayer)

The tennis lobby needs a small WebSocket server (in `server/`), deployable on
Render via `render.yaml`:

1. Deploy the repo to Render (it picks up `render.yaml`) or run `cd server && npm install && npm start` locally.
2. Copy the server's URL and set `NET_URL` near the top of the netplay block in `games/tennis.html` (e.g. `wss://your-app.onrender.com`, or `ws://localhost:3000` for local testing).

The match is host-authoritative: the player who accepts a challenge runs the
simulation and streams state to the other, who sends back their inputs.

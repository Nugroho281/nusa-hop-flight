# NUSA HOP — Island courier seaplane

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Nugroho281/nusa-hop-flight/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Nugroho281/nusa-hop-flight/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

NUSA HOP is a 2D canvas flight game: a seaplane hops between volcanic Indonesian islands through ring gates and lands on short water strips. The whole discipline is throttle and turn — fly too slow and the wing stalls, fly too fast and the engine takes damage, fly too long and the tanks run dry. Six missions with different jobs (medicine against the clock, a ring-gate slalom, a short-strip landing, a storm crossing, a night lantern run, a volcano-ash detour), fuel and damage turning every sortie into a go/no-go call. Every frame is drawn in code — sea, islands, volcano, clouds, the plane's shadow marking its altitude — with lit instruments, a full HUD (altitude, speed, heading, fuel, damage, mission, timer) and synthesised WebAudio sound. No libraries, no network, no files beyond the code.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

Node 22 or later. No build step, no install.

## How to fly

| Key | Does |
| --- | --- |
| W / S or ↑ / ↓ | Throttle up / down |
| A / D or ← / → | Bank left / right |
| I / K or mouse drag | Climb / descend |
| V | Swap chase view / cockpit view |
| P | Pause |
| M | Mute |
| 1–6 | Pick a mission |
| Space / click | Confirm, restart |

Fly through every ring gate to arm the runway, then line up on the buoys and land slow (50–105 kt), straight (within 25° of the strip) and gentle (under 900 ft/min down). Land before the fuel or the clock runs out. Rings build a combo; landing banks the fuel and time bonuses.

## Files

- `game/index.html` — the page; `game/src/` — one job per file: `config.js` (tuning + missions), `random.js` (seeded RNG), `world.js` (route generation), `flight.js` (flight model, no browser in it), `input.js`, `audio.js` (synth sound), `render.js` (chase + cockpit views, HUD, instruments), `shots.js` (screenshot scenes), `main.js` (loop + screens).
- `main.ts` — copies `game/` and `screenshots/` to `/output` and writes `dossier.json`.
- `screenshots/` — real renders of the game's own code in a headless browser.
- `shots.json` — the four screenshot scenes (`?shot=start|play|action|end`).

## Tests

The flight model (`game/src/flight.js`, no browser in it) is exercised by Node tests kept alongside the build: an autopilot flies all six missions gate-to-gate and lands (score > 0, fuel left on every mission), plus stall, overspeed, fuel-empty, terrain and landing-discipline checks. The browser build is exercised headlessly (title → mission select → fly → crash → restart, pause, view toggle, mute) with zero console, page or request errors and zero external requests.

---

<sub>Entered on [make.fun](https://make.fun/?ref=scz7tdtw&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>

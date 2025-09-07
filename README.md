# Mini Orbital Launch

A small 2D rocket sandbox available at https://oursmalin.ovh Fly a rocket in your browser: build speed, tip over, coast to your highest point, and round out your orbit. Meant to be a little fun.

## What It Is
- A simple web game that shows the feel of orbital flight: throttle, gravity turn, coasting to apoapsis, and circularization.
- Runs entirely in the browser. Click, fly.

## What It Does
- Quick, readable 2D flight around a small planet
- Smooth controls and HUD with helpful numbers
- Built‑in “auto pilot” that follows plain‑English‑style commands
- Lightweight art and effects (exhaust, heat glow, debris)

- Not a full‑fidelity physics simulator
- Not a real‑scale solar system (Smaller Planet for faster gameplay)
- Not tied to any backend — all client‑side

## Quick Start (Docker)
- Dev server: `docker-compose up game-dev` → http://localhost:9876
- Tests (one‑off): `docker-compose run --rm game-test`
- Tests (watch): `docker-compose run --rm game-test-watch`
- Lint/format/type‑check:
  - `docker-compose run --rm game-dev npm run lint`
  - `docker-compose run --rm game-dev npm run format`
  - `docker-compose run --rm game-dev npm run type-check`

## Build & Preview
- Build production files: `docker-compose run --rm game-dev npm run build` (writes `dist/`)
- Local static preview (Nginx): `docker-compose up game-prod` → http://localhost:8080

## Command List
- Engine:
  - `ignite` (or `start`, `engine on`), `cut` (or `engine off`, `stop`), `stage`
  - `throttle <0..1>` — e.g., `throttle 1`, `throttle 0.35`
- Attitude / Guidance:
  - `hold prograde | retrograde | up | none`
  - `pitch east|west <deg>` — e.g., `pitch east 5`
- Waiting:
  - `wait <seconds>` — e.g., `wait 2.5`
  - `wait until apoapsis` | `wait until periapsis`
  - `wait until altitude <meters>` — e.g., `wait until altitude 50000`
  - `wait until stage empty` (or `depleted`)
- Until/Targets (can combine with a throttle):
  - `until apoapsis [=|>=|<=] <meters> [throttle <0..1>]`
  - `until periapsis [=|>=|<=] <meters> [throttle <0..1>]`
  - `until twr <=|>= <number> [throttle <0..1>]`
  - `burn_until apoapsis <meters> throttle <0..1>`

Example: `ignite throttle 1 until apoapsis = 100000 throttle 0 wait until apoapsis hold prograde burn_until apoapsis 110000 throttle 0.6 cut`

## How It Works
- Gravity: the planet pulls your rocket toward its center. Close to the ground the pull feels stronger; far away it feels weaker.
- Engines: when you throttle up and ignite, the rocket gets pushed in the direction it’s pointing. Point sideways to go faster around the planet instead of straight up.
- Air: low down the air is thick and pushes back hard; high up it’s thin and barely pushes at all. Going fast in thick air makes the rocket heat up.
- Turning: “hold prograde” points the rocket along its current path; “retrograde” points the other way; “up” points away from the planet.
- Time steps: the game moves the rocket in tiny steps many times per second, so it looks smooth and feels stable.

## Tech (short)
- TypeScript + Vite, Canvas rendering, compact physics
- Path aliases: `@/`, `@/core`, `@/physics`, `@/rendering`, `@/ui`
- Tests: Vitest (jsdom) with coverage; Biome for lint/format

## Architecture (dev)
- Core loop: `GameEngine` orchestrates update → render. Physics uses a semi‑implicit Euler integrator with fixed substeps. Rendering is done with `CanvasRenderer` and HUD overlays in `HUDSystem`.
- Physics/math: under `src/physics/` — `Vector2`, `RigidBody`, `AtmosphericPhysics`, `OrbitalMechanics`, `PhysicsIntegrator`.
- Rendering/UI: under `src/rendering/` and `src/ui/` — canvas primitives, rocket renderer, HUD, and fact bubbles (`FactBubblesSystem`).
- Autopilot: `src/core/Autopilot.ts` parses simple commands and drives the engine through a tiny scheduler.
- Data: `src/data/` for assets like space facts.

## Contributing
- Use Docker workflows for dev/test/lint.
- Format and lint: `docker-compose run --rm game-dev npm run format && npm run lint`.
- Tests: `docker-compose run --rm game-test` (or `game-test-watch`). Add tests for new physics helpers and deterministic engine utilities.
- PRs: include rationale and screenshots/GIFs for HUD changes. Keep commits focused and code styled. Avoid unrelated changes.

## License
MIT, If there is anything usefull in here

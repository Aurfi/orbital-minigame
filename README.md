# Mini Orbital Launch

A tiny 2D rocket sandbox you can play in the browser. Build speed, tip over, coast to Ap, and circularize. Simple, fast, a bit cheeky, and surprisingly educational.

## What It Does
- Quick‑feel orbital flight on a “small planet” (fun over perfection)
- Gravity turn guidance vibe with smooth controls and readable HUD
- Scriptable autopilot console with friendly commands
- Simple art with juicy effects (exhaust, heat glow, debris)

## What It’s Not
- Not a full‑fidelity physics simulator
- Not a real‑scale solar system
- Not a multiplayer or server game
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

## Autopilot Cheatsheet
- `ignite`, `cut`, `throttle 0..1`
- `pitch east|west <deg>`, `hold prograde`, `hold retrograde`, `hold up`
- `wait <seconds>`
- `wait until apoapsis | periapsis | stage empty`
- `until apoapsis = <m>` or `until periapsis = <m>` (optional `throttle <x>`)

## Tech (short)
- TypeScript + Vite, canvas rendering, tiny physics
- Path aliases: `@/`, `@/core`, `@/physics`, `@/rendering`, `@/ui`
- Tests: Vitest (jsdom) with coverage; Biome for lint/format

## License
MIT

# Mini Orbital Launch

A tiny 2D rocket sandbox you can play in the browser. Build speed, tip over, coast to Ap, and circularize. Simple, fast, a bit cheeky, and surprisingly educational.

## What It Is
- A playful orbital‑flight toy that teaches intuition: throttle, gravity turn, coasting to apoapsis, circularization.
- Single‑page web app — click, fly, repeat. No accounts. No backend.

## What It Does
- Quick‑feel orbital flight on a “small planet” (fun over perfection)
- Gravity turn guidance vibe with smooth controls and readable HUD
- Scriptable autopilot console with friendly commands
- Simple art with juicy effects (exhaust, heat glow, debris)

## What It’s Not
- Not a full‑fidelity physics simulator
- Not a real‑scale solar system
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
- `ignite`, `cut`, `throttle 0..1`
- `pitch east|west <deg>`, `hold prograde`, `hold retrograde`, `hold up`
- `wait <seconds>`
- `wait until apoapsis | periapsis | stage empty`
- `until apoapsis = <m>` or `until periapsis = <m>` (optional `throttle <x>`)

## How It Works (short)
- Physics: 2D point‑mass around a small planet. Gravity g = GM/r²; altitude = r − R. Atmosphere uses a simple density curve vs altitude.
- Forces: Thrust from current stage; drag Fd = ½·ρ·Cd·A·v² opposing velocity; gravity towards center.
- Integrator: Semi‑implicit Euler at a fixed tick; clamped time step; stable enough for arcade use.
- Guidance: “Hold prograde/retrograde/up” sets a target angle; a small controller slews the rocket towards the target.
- Autopilot: A tiny interpreter parses commands like `until apoapsis = 100000 throttle 0.5` and drives throttle/attitude.
- Rendering: HTML canvas with a camera, sprite/line layers, HUD overlays, and small effects.

## Tech (short)
- TypeScript + Vite, canvas rendering, tiny physics
- Path aliases: `@/`, `@/core`, `@/physics`, `@/rendering`, `@/ui`
- Tests: Vitest (jsdom) with coverage; Biome for lint/format

## License
MIT

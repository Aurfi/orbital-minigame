# Mini Orbital Launch

Tiny 2D rocket sandbox. Build speed, gravity turn, coast to Ap, and circularize — all in your browser.

## Develop & Test (Docker)
- Dev server: `docker-compose up game-dev` → http://localhost:9876
- Run tests: `docker-compose run --rm game-test`
- Watch tests: `docker-compose run --rm game-test-watch`
- Lint/format/type-check:
  - `docker-compose run --rm game-dev npm run lint`
  - `docker-compose run --rm game-dev npm run format`
  - `docker-compose run --rm game-dev npm run type-check`

## Build & Serve
- Build production assets: `docker-compose run --rm game-dev npm run build` (outputs `dist/`)
- Serve built assets locally (Nginx): `docker-compose up game-prod` → http://localhost:8080
- Deploy: copy `dist/` to any static host (GitHub Pages workflow available)

## Highlights
- Scriptable “Auto Pilot” console (no coding needed):
  `ignite throttle 1 until apoapsis = 100000 throttle 0 wait until apoapsis hold prograde ignite throttle 1 until periapsis = 110000 cut`
- Realistic gravity‑turn feel (prograde guidance), tiny‑planet orbital mechanics
- Smooth vector + sprite art, exhaust/heat effects, space facts, kid‑friendly UI

## Commands (short list)
- `ignite`, `cut`, `throttle 0..1`
- `pitch east|west <deg>`, `hold prograde`, `hold retrograde`
- `wait <seconds>`
- `wait until altitude <m>`, `wait until apoapsis`, `wait until periapsis`, `wait until stage empty`
- `until apoapsis = <m>`, `until periapsis = <m>` (with current throttle)

## Local (optional)
Direct `npm` on the host is discouraged. If needed:
```bash
npm ci
npm run dev   # http://localhost:9876
npm run build # outputs dist/
```

## License
MIT

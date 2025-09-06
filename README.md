# Mini Orbital Launch Game

Educational web-based rocket simulation game that teaches programming concepts and orbital mechanics.

## 🐳 Docker Development Setup

### Prerequisites
- Docker and Docker Compose installed

### Quick Start

**First time setup (choose one):**

**Option 1: Automated setup (recommended)**
```bash
# Linux/Mac
./setup.sh

# Windows
setup.bat
```

**Option 2: Manual setup**
```bash
docker-compose build game-base
```

**Daily development commands:**

1. **Development server (ALWAYS use this):**
   ```bash
   docker-compose up game-dev
   ```
   Game will be available at http://localhost:9876

2. **Run tests (ALWAYS use this):**
   ```bash
   docker-compose run --rm game-test
   ```

3. **Watch tests during development:**
   ```bash
   docker-compose run --rm game-test-watch
   ```

4. **Build the project:**
   ```bash
   docker-compose run --rm game-dev npm run build
   ```

5. **Code formatting and linting:**
   ```bash
   docker-compose run --rm game-dev npm run format
   docker-compose run --rm game-dev npm run lint
   ```

### Development Workflow

- **One-time setup**: Build the base image with `docker-compose build game-base`
- **Daily development**: Use `docker-compose up game-dev` for development server
- **Fast testing**: Use `docker-compose run --rm game-test` for quick test runs
- The development server runs with hot reload
- Source code is mounted as a volume for instant updates
- Node modules are cached in a Docker volume for faster rebuilds
- All dependencies are managed within the container
- **No rebuilding needed** unless package.json changes

### Rebuilding (only when needed)

Only rebuild the Docker image when:
- package.json dependencies change
- Dockerfile is modified
- You want to update the base Node.js version

```bash
docker-compose build game-base --no-cache  # Force rebuild if needed
```

## Project Structure

```
src/
├── core/          # Core game engine and interfaces
├── physics/       # Physics simulation and orbital mechanics
├── rendering/     # Canvas rendering and graphics
└── ui/            # User interface and HUD elements
```

## Gameplay Overview

This section documents how the game currently behaves. It focuses on what is implemented and how it works under the hood.

### Controls

- Space: Start engine (ignite)
- T: Full throttle (100%)
- G: Zero throttle (0%)
- B: Cut engines (ignition OFF, throttle → 0%)
- Up/Down: Throttle ±10%
- Left/Right: Turn rate (slow, heavy rocket)
- S: Stage
- Scroll: Zoom

Notes:
- Game speed gating: 3x > 500 m, 10x > 1 km, 50x > 30 km. A brief message appears if clicked too early.
- Mission timer uses simulated time and scales with game speed.

### Planet and Physics

- Planet radius: 350 km (cartoon scale) with surface gravity 9.81 m/s².
- Gravity uses μ = g · R²; orbital mechanics are physically consistent.
- Atmospheric “fake” damping and heating apply only below 80 km. Above 80 km the rocket is in vacuum.
- The planet rotates at a realistic rate; before liftoff the rocket is clamped and moves with the ground.
- Ground-relative HUD velocity and ground-relative impact speeds ignore Earth rotation at the surface.

### Liftoff, Clamps, and Ground Support

- On start/restart, the rocket is clamped to the pad and aligned to the ground frame (no visual drift).
- First successful ignition auto-releases clamps.
- If the rocket is at ground contact and TWR ≤ 1.01, it remains resting on the ground and rotates with Earth; physics integration is skipped until TWR > 1.01.

### Staging

- Staging (S) cleanly separates the previous stage 20–25 px below the active stage along rocket orientation; no wobble animation.
- The previous stage drifts and falls under gravity with simple visuals.

### HUD

Left panel (auto-sized):
- Altitude (m), Velocity (m/s), Mass (kg), Throttle (%), TWR, ISP, Stage, Engine ON/OFF
- “Safe/Unsafe/Too fast” indicator (green/orange/red) below 80 km only.

Mini “Orbit View” (bottom-right):
- Small rotating polar-view globe (north pole at center, stylized continents at limb).
- Rocket marker (X) and dotted predicted trajectory.
- Apoapsis (green) / Periapsis (red) dots and stacked labels above the mini-map.
- “Stable orbit achieved! 🎉” message when perigee > 80 km after ~1 revolution.
- Trajectory simulation:
  - Simulates up to 8 hours, stops early on collision, early stable orbit, or escape (E > 0 and r > 6R).
  - Adaptive dt: 1 s (0–1 h), 5 s (1–3 h), 15 s (3–6 h), 30 s (6–8 h).
  - Draws as capped number of dots for performance.

Atmosphere messages:
- Short, panel-sized, stacked HUD toasts (e.g., “Good luck!”, “3x > 500 m”).

### Space Facts

- Facts show above 5 km altitude (no upper limit), every 20–45 s wall-clock.
- Facts are displayed in a fixed top-right position so they never cover apo/peri labels.
- Fade timing uses wall-clock time; cadence and durations are not affected by time warp.
- No repeats until all facts have been seen; progress persists in localStorage.

## Key Implementation Notes

### Files of interest

- `src/core/GameEngine.ts`
  - Game loop, state, input, physics update.
  - Ground clamp/ground support logic.
  - Speed gating, messages, and space facts (spawn, update, wall-clock timing).
  - Background rendering orchestration and sky gradient.

- `src/physics/WorldParameters.ts`
  - Planet parameters (radius, gravity), rotation rate, atmosphere scale height.

- `src/rendering/CanvasRenderer.ts`
  - Drawing helpers; world→screen transforms; added `fillRadialGradientWorld` for atmospheric glow.

- `src/ui/HUDSystem.ts`
  - Stats panel, dynamic controls panel, mini-map rendering and adaptive trajectory, apo/peri detection.

### Ground-relative quantities

- HUD velocity below 1 km (and while clamped) is rocket velocity minus ground tangential speed (ω·R).
- Ground impact checks use ground-relative speed; rotation does not cause false “fast” impacts.

### Sky gradient

- A radial gradient centered at planet fades from light blue (near surface) to deep blue (space). The faint glow extends beyond the nominal atmosphere to ~250 km for a smooth transition.

## What’s Simplified / Not Simulated

Honest caveats about the current model:

- 2D plane only; no orbital inclination, plane changes, or 3D effects.
- Single-body gravity (no Moon/Sun gravity in the integrator). The “Moon” is visual only.
- Atmosphere is simplified: visual haze + a game-play damping model below 80 km; no true aero-drag/lift/pressure/angle-of-attack effects.
- No aerodynamic stability, fins, torque, roll/yaw control, or control authority modeling.
- Thrust direction is tied to the rocket’s rotation; no gimbal limits or engine spool-up.
- Mass flow is simplified: each stage consumes fuel linearly with throttle using ISP; no pressurization, mixture ratios, or boil-off.
- Ground is a perfect sphere; no local terrain height variations, slopes, or collisions with buildings.
- Planet rotation is uniform; no latitude/longitude system or Coriolis/centrifugal forces beyond the visual ground frame and initial tangential motion.
- Time step integration uses semi-implicit Euler for the forward simulation; the trajectory preview uses an adaptive step integrator but still ignores drag and thrust.
- No persistence/saves; runs are transient.

### Roadmap ideas (non-binding)

- Optional, better drag model below 80 km (Cd·A varying with attitude and Mach-like effects).

- Sound/FX under thrust depending on thrust % and engine

## Releasing / Running

Use Docker for all dev/test/build tasks (see instructions above). The dev server runs at http://localhost:9876.

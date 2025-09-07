import type { Vector2 } from '@/physics/Vector2.js';
import type { WorldParameters } from '@/physics/WorldParameters.js';
import { calculateTerminalVelocity } from '../physics/AtmosphericPhysics.js';

export type AtmosphereInputs = {
  world: WorldParameters;
  position: Vector2;
  velocity: Vector2;
  mass: number;
  aeroCdEff: number;
  aeroAreaEff: number;
  heatLevel: number;
  atmosphericGlow: number;
  hasBurnedUp: boolean;
  isGameOver: boolean;
  currentTime: number;
  overspeedTime?: number; // Track how long we've been overspeeding
};

export type AtmosphereResult = {
  velocity: Vector2;
  heatLevel: number;
  atmosphericGlow: number;
  hasBurnedUp: boolean;
  gameOverReason?: string;
  explode?: boolean;
  destroy?: boolean;
  overspeedTime?: number;
};

/**
 * Clamp atmospheric speed softly and update heating/overstress. Pure fn.
 */
export function enforceAtmosphericLimits(
  input: AtmosphereInputs,
  deltaTime: number
): AtmosphereResult {
  const position = input.position;
  let velocity = input.velocity;
  const speed = velocity.magnitude();
  const altitude = input.world.getAltitude(position.magnitude());

  // Only apply within atmosphere (fake clamp off above ~80 km)
  if (altitude >= 80_000) {
    // Cool down gradually in space
    return {
      velocity,
      heatLevel: Math.max(0, input.heatLevel - 10 * deltaTime),
      atmosphericGlow: input.atmosphericGlow,
      hasBurnedUp: input.hasBurnedUp,
    };
  }

  const density = input.world.getAtmosphericDensity(altitude);
  const gravity = input.world.getGravitationalAcceleration(position.magnitude());

  // Compute a reference terminal velocity and set a max allowed speed factor above it
  const mass = input.mass;
  // Use effective Cd·A matching our aero model
  const cd = input.aeroCdEff as number;
  const area = input.aeroAreaEff as number;
  // Terminal velocity is used as a soft reference, not a hard cap.
  const vTerm = calculateTerminalVelocity(mass, density, cd, area, gravity);
  // Allow a reasonable buffer above terminal velocity for powered ascent/re-entry glides
  const vMax = (Number.isFinite(vTerm) ? vTerm : 10_000) * 1.35 + 50; // Moderately tolerant reference speed

  // If exceeding the reference limit, apply only a mild atmospheric damping (not a hard clamp)
  let heatLevel = input.heatLevel;
  let atmosphericGlow = input.atmosphericGlow;
  let hasBurnedUp = input.hasBurnedUp;
  let gameOverReason: string | undefined;
  let explode = false;
  let destroy = false;

  if (speed > vMax && speed > 0) {
    const overRatio = speed / Math.max(1, vMax);
    const densityNorm = Math.min(1, density / input.world.surfaceDensity);
    // Make damping very light and sub-linear in over-speed so high TWR can push through
    const over = Math.max(0, overRatio - 1);
    const decelRate = (1.5 + 8 * densityNorm) * over ** 0.7; // m/s^2
    const vUnit = velocity.multiply(1 / speed);
    const deltaV = decelRate * deltaTime;
    const newSpeed = Math.max(0, speed - deltaV);
    velocity = vUnit.multiply(newSpeed);

    // Heating accumulates when above the safe limit; reduced rate for more tolerance
    heatLevel += (overRatio - 1) * (0.4 + 0.8 * densityNorm) * 50 * deltaTime;
  } else {
    // Near the limit (85%-100%) produces slight heating
    const ratio = speed / Math.max(1, vMax);
    if (ratio > 0.85) {
      const densityNorm = Math.min(1, density / input.world.surfaceDensity);
      heatLevel += (ratio - 0.85) * 20 * densityNorm * deltaTime;
    } else {
      // Cool down slowly if comfortably within limits
      heatLevel = Math.max(0, heatLevel - 15 * deltaTime);
    }
  }

  // Visual heating feedback scales with density and speed
  const heatGlow = Math.min(1, (density / input.world.surfaceDensity) * (speed / (vMax + 1)));
  atmosphericGlow = Math.max(atmosphericGlow, heatGlow);

  // Burn-up if overheated too long
  if (!hasBurnedUp && heatLevel >= 100) {
    hasBurnedUp = true;
    gameOverReason = 'Thermal failure (overheating)';
    explode = true;
    destroy = true;
  }

  // Track overspeed time
  let overspeedTime = input.overspeedTime || 0;

  // Random structural failure chance when far over the limit
  if (
    !input.isGameOver &&
    !input.world.isInSpace(altitude) &&
    Number.isFinite(vMax) &&
    speed > vMax * 1.2 // Moderately tolerant: 1.2x instead of 1.15x
  ) {
    overspeedTime += deltaTime;

    // Only calculate failure chance after 1 second of sustained overspeed
    if (overspeedTime > 1.0) {
      const ratio = speed / vMax;
      const densityNorm = Math.min(1, density / input.world.surfaceDensity);
      // Probability per second increases with (ratio-1.2)^2 and density
      const pps = Math.min(0.9, (ratio - 1.2) * (ratio - 1.2) * (0.35 + 0.65 * densityNorm));
      const p = 1 - Math.exp(-pps * deltaTime); // convert to per-frame
      if (Math.random() < p) {
        gameOverReason = 'Aerodynamic structural failure (overspeed)';
        explode = true;
        destroy = true;
      }
    }
  } else {
    // Reset overspeed timer if we're back within safe limits
    overspeedTime = 0;
  }

  return {
    velocity,
    heatLevel,
    atmosphericGlow,
    hasBurnedUp,
    gameOverReason,
    explode,
    destroy,
    overspeedTime,
  };
}

import { calculateApoapsis, calculatePeriapsis } from '@/physics/OrbitalMechanics';
import type { Vector2 } from '@/physics/Vector2';

/**
 * Small helper for apoapsis/periapsis projection from state.
 * Pure calculation so HUD and Autopilot can share it.
 */
export function computeApoPeri(
  position: Vector2,
  velocity: Vector2,
  mu: number,
  planetRadius: number
) {
  const apoAlt = calculateApoapsis(position, velocity, mu, planetRadius);
  const periAlt = calculatePeriapsis(position, velocity, mu, planetRadius);
  return { apoAlt, periAlt };
}

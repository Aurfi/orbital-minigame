import { Vector2 } from './Vector2.js';

// Atmospheric physics calculations for drag and heating (module-level)
export function calculateDensity(
  altitude: number,
  surfaceDensity: number,
  scaleHeight: number
): number {
  return surfaceDensity * Math.exp(-altitude / scaleHeight);
}

// Standard drag model: Fd = 0.5 * rho * v^2 * Cd * A, opposite to velocity
export function calculateDragForce(
  velocity: Vector2,
  density: number,
  dragCoefficient: number,
  crossSectionalArea: number
): Vector2 {
  const speed = velocity.magnitude();
  if (speed === 0) return Vector2.zero();
  const dragMagnitude = 0.5 * density * speed * speed * dragCoefficient * crossSectionalArea;
  const dragDirection = velocity.normalized().multiply(-1);
  return dragDirection.multiply(dragMagnitude);
}

// Dynamic pressure ("q"): useful for max-Q and heating cues
export function calculateDynamicPressure(velocity: Vector2, density: number): number {
  const speed = velocity.magnitude();
  return 0.5 * density * speed * speed;
}

// Very simple heat flux: proportional to q * v (gameplay-scaled)
export function calculateHeatFlux(velocity: Vector2, density: number): number {
  const speed = velocity.magnitude();
  const q = calculateDynamicPressure(velocity, density);
  return q * speed * 0.001;
}

export function isOverpressure(dynamicPressure: number, maxQ: number): boolean {
  return dynamicPressure > maxQ;
}

// Terminal velocity using balance of drag and weight
export function calculateTerminalVelocity(
  mass: number,
  density: number,
  dragCoefficient: number,
  crossSectionalArea: number,
  gravity: number
): number {
  if (density === 0) return Number.POSITIVE_INFINITY;
  return Math.sqrt((2 * mass * gravity) / (density * dragCoefficient * crossSectionalArea));
}

// Rough heat meter change per dt from dynamic pressure
export function calculateHeatBuildup(dynamicPressure: number, deltaTime: number): number {
  if (dynamicPressure <= 0) return 0;
  const heatRate = (dynamicPressure / 1000) * deltaTime;
  return Math.min(heatRate, 100);
}

export function isOverheating(dynamicPressure: number): boolean {
  return dynamicPressure > 50_000;
}

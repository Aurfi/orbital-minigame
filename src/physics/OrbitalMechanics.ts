import type { Vector2 } from './Vector2.js';

// Orbital mechanics calculation functions
export class OrbitalMechanics {
  /**
   * Calculate apoapsis altitude from position and velocity vectors
   * @param position Current position vector (m)
   * @param velocity Current velocity vector (m/s)
   * @param mu Gravitational parameter (m³/s²)
   * @returns Apoapsis altitude above surface (m)
   */
  static calculateApoapsis(position: Vector2, velocity: Vector2, mu: number): number {
    const r = position.magnitude();
    const v = velocity.magnitude();
    const specificEnergy = (v * v) / 2 - mu / r;

    if (specificEnergy >= 0) return Number.POSITIVE_INFINITY; // Escape trajectory

    const semiMajorAxis = -mu / (2 * specificEnergy);
    const h = position.cross(velocity);
    const eccentricity = Math.sqrt(1 + (2 * specificEnergy * h * h) / (mu * mu));

    const apoapsisRadius = semiMajorAxis * (1 + eccentricity);
    const planetRadius = 600_000; // Default toy Earth radius
    return Math.max(0, apoapsisRadius - planetRadius);
  }

  /**
   * Calculate periapsis altitude from orbital parameters
   * @param position Current position vector (m)
   * @param velocity Current velocity vector (m/s)
   * @param mu Gravitational parameter (m³/s²)
   * @returns Periapsis altitude above surface (m)
   */
  static calculatePeriapsis(position: Vector2, velocity: Vector2, mu: number): number {
    const r = position.magnitude();
    const v = velocity.magnitude();
    const specificEnergy = (v * v) / 2 - mu / r;

    if (specificEnergy >= 0) return Number.NEGATIVE_INFINITY; // Escape trajectory

    const semiMajorAxis = -mu / (2 * specificEnergy);
    const h = position.cross(velocity);
    const eccentricity = Math.sqrt(1 + (2 * specificEnergy * h * h) / (mu * mu));

    const periapsisRadius = semiMajorAxis * (1 - eccentricity);
    const planetRadius = 600_000; // Default toy Earth radius
    return periapsisRadius - planetRadius;
  }

  /**
   * Calculate orbital eccentricity
   * @param position Current position vector (m)
   * @param velocity Current velocity vector (m/s)
   * @param mu Gravitational parameter (m³/s²)
   * @returns Orbital eccentricity (0 = circular, >1 = hyperbolic)
   */
  static calculateEccentricity(position: Vector2, velocity: Vector2, mu: number): number {
    const r = position.magnitude();
    const v = velocity.magnitude();
    const specificEnergy = (v * v) / 2 - mu / r;
    const h = position.cross(velocity);

    return Math.sqrt(1 + (2 * specificEnergy * h * h) / (mu * mu));
  }

  /**
   * Check if orbit is stable (closed ellipse with safe parameters)
   * @param apoapsis Apoapsis altitude (m)
   * @param periapsis Periapsis altitude (m)
   * @param eccentricity Orbital eccentricity
   * @returns True if orbit is stable
   */
  static isStableOrbit(apoapsis: number, periapsis: number, eccentricity: number): boolean {
    // Check for escape trajectory
    if (apoapsis === Number.POSITIVE_INFINITY || eccentricity >= 1.0) return false;

    // Check minimum safe altitude (70km)
    if (periapsis < 70_000) return false;

    // Check maximum eccentricity for stability (0.1)
    if (eccentricity > 0.1) return false;

    return true;
  }

  /**
   * Calculate circular orbital velocity
   * @param radius Orbital radius (m)
   * @param mu Gravitational parameter (m³/s²)
   * @returns Circular orbital velocity (m/s)
   */
  static calculateCircularVelocity(radius: number, mu: number): number {
    return Math.sqrt(mu / radius);
  }

  /**
   * Calculate escape velocity
   * @param radius Distance from center (m)
   * @param mu Gravitational parameter (m³/s²)
   * @returns Escape velocity (m/s)
   */
  static calculateEscapeVelocity(radius: number, mu: number): number {
    return Math.sqrt((2 * mu) / radius);
  }

  /**
   * Calculate prograde direction (velocity normalized)
   * @param velocity Current velocity vector
   * @returns Normalized prograde direction vector
   */
  static getProgradeDirection(velocity: Vector2): Vector2 {
    return velocity.normalized();
  }

  /**
   * Calculate retrograde direction (opposite of velocity)
   * @param velocity Current velocity vector
   * @returns Normalized retrograde direction vector
   */
  static getRetrogradeDirection(velocity: Vector2): Vector2 {
    return velocity.normalized().multiply(-1);
  }
}

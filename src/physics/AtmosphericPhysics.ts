import { Vector2 } from './Vector2.js';

// Atmospheric physics calculations for drag and heating
export class AtmosphericPhysics {
  /**
   * Calculate atmospheric density at given altitude using exponential model
   * ρ(h) = ρ₀ · e^(-h/H)
   * @param altitude Altitude above surface (m)
   * @param surfaceDensity Surface density ρ₀ (kg/m³)
   * @param scaleHeight Scale height H (m)
   * @returns Atmospheric density (kg/m³)
   */
  static calculateDensity(altitude: number, surfaceDensity: number, scaleHeight: number): number {
    return surfaceDensity * Math.exp(-altitude / scaleHeight);
  }

  /**
   * Calculate drag force using F_d = 0.5 · ρ · v² · C_d · A
   * @param velocity Velocity vector (m/s)
   * @param density Atmospheric density (kg/m³)
   * @param dragCoefficient Drag coefficient C_d (dimensionless)
   * @param crossSectionalArea Cross-sectional area A (m²)
   * @returns Drag force vector (N)
   */
  // Standard drag model: Fd = 0.5 * rho * v^2 * Cd * A, opposite to velocity
  static calculateDragForce(
    velocity: Vector2,
    density: number,
    dragCoefficient: number,
    crossSectionalArea: number
  ): Vector2 {
    const speed = velocity.magnitude();
    if (speed === 0) return Vector2.zero();

    const dragMagnitude = 0.5 * density * speed * speed * dragCoefficient * crossSectionalArea;
    const dragDirection = velocity.normalized().multiply(-1); // Opposite to velocity

    return dragDirection.multiply(dragMagnitude);
  }

  /**
   * Calculate dynamic pressure q = 0.5 · ρ · v²
   * @param velocity Velocity vector (m/s)
   * @param density Atmospheric density (kg/m³)
   * @returns Dynamic pressure (Pa)
   */
  // Dynamic pressure ("q"): useful for max-Q and heating cues
  static calculateDynamicPressure(velocity: Vector2, density: number): number {
    const speed = velocity.magnitude();
    return 0.5 * density * speed * speed;
  }

  /**
   * Calculate heat flux for thermal effects
   * Simplified model based on dynamic pressure and velocity
   * @param velocity Velocity vector (m/s)
   * @param density Atmospheric density (kg/m³)
   * @returns Heat flux (W/m²)
   */
  // Very simple heat flux: proportional to q * v. Not physically exact,
  // chosen for readable gameplay feedback.
  static calculateHeatFlux(velocity: Vector2, density: number): number {
    const speed = velocity.magnitude();
    const dynamicPressure = AtmosphericPhysics.calculateDynamicPressure(velocity, density);

    // Simplified heating model: heat ∝ ρ * v³
    return dynamicPressure * speed * 0.001; // Scaling factor for game balance
  }

  /**
   * Check if dynamic pressure exceeds safe limits
   * @param dynamicPressure Current dynamic pressure (Pa)
   * @param maxQ Maximum safe dynamic pressure (Pa)
   * @returns True if overpressure condition exists
   */
  static isOverpressure(dynamicPressure: number, maxQ: number): boolean {
    return dynamicPressure > maxQ;
  }

  /**
   * Calculate terminal velocity for given conditions
   * @param mass Object mass (kg)
   * @param density Atmospheric density (kg/m³)
   * @param dragCoefficient Drag coefficient
   * @param crossSectionalArea Cross-sectional area (m²)
   * @param gravity Gravitational acceleration (m/s²)
   * @returns Terminal velocity (m/s)
   */
  // Terminal velocity using balance of drag and weight
  static calculateTerminalVelocity(
    mass: number,
    density: number,
    dragCoefficient: number,
    crossSectionalArea: number,
    gravity: number
  ): number {
    if (density === 0) return Number.POSITIVE_INFINITY;

    return Math.sqrt((2 * mass * gravity) / (density * dragCoefficient * crossSectionalArea));
  }

  /**
   * Calculate heat buildup from dynamic pressure
   * @param dynamicPressure Dynamic pressure (Pa)
   * @param deltaTime Time step (s)
   * @returns Heat buildup rate (percentage per second)
   */
  // Integrates a very rough "heat meter" from dynamic pressure
  static calculateHeatBuildup(dynamicPressure: number, deltaTime: number): number {
    if (dynamicPressure <= 0) return 0;

    // Heat buildup is proportional to dynamic pressure
    const heatRate = (dynamicPressure / 1000) * deltaTime; // Simplified model
    return Math.min(heatRate, 100); // Cap at 100%
  }

  /**
   * Check if vehicle is overheating from dynamic pressure
   * @param dynamicPressure Dynamic pressure (Pa)
   * @returns True if overheating
   */
  static isOverheating(dynamicPressure: number): boolean {
    return dynamicPressure > 50_000; // 50 kPa danger threshold
  }
}

// World parameters configuration for toy-Earth physics
export class WorldParameters {
  // Planetary constants (cartoon small Earth, same surface g)
  public readonly planetRadius: number = 350_000; // 350 km radius (smaller planet)
  public readonly surfaceGravity: number = 9.81; // m/s²
  public readonly gravitationalParameter: number; // μ = g₀ · R²

  // Atmospheric constants (keep original Earth-like feel)
  public readonly atmosphereScaleHeight: number = 7_000; // 7 km scale height
  public readonly surfaceDensity: number = 1.2; // kg/m³ at sea level
  public readonly maxDynamicPressure: number = 50_000; // 50 kPa max-Q limit
  // Planet rotation (rad/s); Earth ~7.2921159e-5
  public readonly earthRotationRate: number = 7.2921159e-5;

  // Rocket constants
  public readonly defaultDragCoefficient: number = 0.3;
  public readonly defaultCrossSectionalArea: number = 10; // m²

  constructor() {
    // Calculate gravitational parameter from surface gravity and radius
    this.gravitationalParameter = this.surfaceGravity * this.planetRadius * this.planetRadius;
    // Atmosphere parameters remain unscaled for familiar feel
  }

  /**
   * Get altitude from position vector magnitude
   * @param positionMagnitude Distance from planet center (m)
   * @returns Altitude above surface (m)
   */
  getAltitude(positionMagnitude: number): number {
    return positionMagnitude - this.planetRadius;
  }

  /**
   * Get atmospheric density at given altitude
   * @param altitude Altitude above surface (m)
   * @returns Atmospheric density (kg/m³)
   */
  getAtmosphericDensity(altitude: number): number {
    return this.surfaceDensity * Math.exp(-altitude / this.atmosphereScaleHeight);
  }

  /**
   * Get gravitational acceleration at given distance from center
   * @param distance Distance from planet center (m)
   * @returns Gravitational acceleration (m/s²)
   */
  getGravitationalAcceleration(distance: number): number {
    return this.gravitationalParameter / (distance * distance);
  }

  /**
   * Check if position is below surface (crashed)
   * @param positionMagnitude Distance from planet center (m)
   * @returns True if below surface
   */
  isBelowSurface(positionMagnitude: number): boolean {
    return positionMagnitude < this.planetRadius;
  }

  /**
   * Check if altitude is in space (above atmosphere)
   * @param altitude Altitude above surface (m)
   * @returns True if in space (>100km altitude)
   */
  isInSpace(altitude: number): boolean {
    return altitude > 100_000; // Kármán line equivalent
  }

  /**
   * Check if altitude is in atmosphere
   * @param altitude Altitude above surface (m)
   * @returns True if in atmosphere (<70km altitude)
   */
  isInAtmosphere(altitude: number): boolean {
    return altitude < 70_000; // Below 70km is considered atmosphere
  }

  /**
   * Get orbital velocity for circular orbit at given altitude
   * @param altitude Altitude above surface (m)
   * @returns Orbital velocity (m/s)
   */
  getCircularOrbitVelocity(altitude: number): number {
    const orbitalRadius = this.planetRadius + altitude;
    return Math.sqrt(this.gravitationalParameter / orbitalRadius);
  }

  /**
   * Get escape velocity from given altitude
   * @param altitude Altitude above surface (m)
   * @returns Escape velocity (m/s)
   */
  getEscapeVelocity(altitude: number): number {
    const distance = this.planetRadius + altitude;
    return Math.sqrt((2 * this.gravitationalParameter) / distance);
  }
}

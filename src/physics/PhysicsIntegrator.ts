import type { Vector2 } from './Vector2.js';

// Semi-implicit Euler integrator for stable physics simulation
export class PhysicsIntegrator {
  private readonly fixedTimestep: number = 1 / 60; // 60 Hz physics
  private readonly maxSubsteps: number = 10;
  private accumulator = 0;

  /**
   * Update physics with variable timestep using fixed substeps
   * @param deltaTime Frame time (seconds)
   * @param updateCallback Function to call for each physics substep
   */
  // Runs fixed substeps even if frame time varies. Prevents "spiral of death".
  update(deltaTime: number, updateCallback: (dt: number) => void): void {
    // Clamp deltaTime to prevent spiral of death
    const clampedDeltaTime = Math.min(deltaTime, 0.25);
    this.accumulator += clampedDeltaTime;

    let substeps = 0;
    while (this.accumulator >= this.fixedTimestep && substeps < this.maxSubsteps) {
      updateCallback(this.fixedTimestep);
      this.accumulator -= this.fixedTimestep;
      substeps++;
    }

    // If we hit max substeps, consume remaining time to prevent accumulation
    if (substeps >= this.maxSubsteps) {
      this.accumulator = 0;
    }
  }

  /**
   * Semi-implicit Euler integration step
   * More stable than explicit Euler for orbital mechanics
   * @param position Current position (modified in place)
   * @param velocity Current velocity (modified in place)
   * @param acceleration Current acceleration
   * @param deltaTime Integration timestep
   */
  // Semi-implicit Euler: stable for forces like gravity + thrust
  static integrateMotion(
    position: Vector2,
    velocity: Vector2,
    acceleration: Vector2,
    deltaTime: number
  ): void {
    // Store initial velocity for position update
    const initialVelocity = velocity.clone();

    // Update velocity: v(t+dt) = v(t) + a(t) * dt
    velocity.x += acceleration.x * deltaTime;
    velocity.y += acceleration.y * deltaTime;

    // Update position using average velocity for better accuracy
    const avgVelocity = initialVelocity.add(velocity).multiply(0.5);
    position.x += avgVelocity.x * deltaTime;
    position.y += avgVelocity.y * deltaTime;
  }

  /**
   * Verlet integration (alternative, more accurate for conservative forces)
   * @param position Current position (modified in place)
   * @param velocity Current velocity (modified in place)
   * @param acceleration Current acceleration
   * @param previousAcceleration Previous frame acceleration
   * @param deltaTime Integration timestep
   */
  // Verlet alternative (not used by default). Better for conservative forces,
  // but needs previous acceleration.
  static integrateVerlet(
    position: Vector2,
    velocity: Vector2,
    acceleration: Vector2,
    previousAcceleration: Vector2,
    deltaTime: number
  ): void {
    const dt2 = deltaTime * deltaTime;

    // Position: x(t+dt) = x(t) + v(t)*dt + 0.5*a(t)*dt²
    position.x += velocity.x * deltaTime + 0.5 * acceleration.x * dt2;
    position.y += velocity.y * deltaTime + 0.5 * acceleration.y * dt2;

    // Velocity: v(t+dt) = v(t) + 0.5*(a(t) + a(t+dt))*dt
    // Note: This requires acceleration at t+dt, so we approximate with current
    velocity.x += 0.5 * (previousAcceleration.x + acceleration.x) * deltaTime;
    velocity.y += 0.5 * (previousAcceleration.y + acceleration.y) * deltaTime;
  }

  /**
   * Check integration stability
   * @param velocity Current velocity
   * @param acceleration Current acceleration
   * @param deltaTime Integration timestep
   * @returns True if integration is stable
   */
  // Quick guard rails for extreme numbers. Helps avoid explosions in state.
  static isStable(velocity: Vector2, acceleration: Vector2, deltaTime: number): boolean {
    const maxVelocity = 50_000; // 50 km/s max velocity
    const maxAcceleration = 1000; // 1000 m/s² max acceleration

    return (
      velocity.magnitude() < maxVelocity &&
      acceleration.magnitude() < maxAcceleration &&
      deltaTime > 0 &&
      deltaTime < 1
    );
  }

  /**
   * Get recommended timestep for given conditions
   * @param velocity Current velocity
   * @param acceleration Current acceleration
   * @returns Recommended timestep (seconds)
   */
  static getRecommendedTimestep(velocity: Vector2, acceleration: Vector2): number {
    const baseTimestep = 1 / 60;
    const velocityMag = velocity.magnitude();
    const accelMag = acceleration.magnitude();

    // Reduce timestep for high velocities or accelerations
    if (velocityMag > 10_000 || accelMag > 100) {
      return baseTimestep * 0.5;
    }

    return baseTimestep;
  }
}

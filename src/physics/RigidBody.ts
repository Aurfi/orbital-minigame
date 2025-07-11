import { PhysicsIntegrator } from './PhysicsIntegrator.js';
import { Vector2 } from './Vector2.js';

// RigidBody class for rocket physics simulation
export class RigidBody {
  public position: Vector2;
  public velocity: Vector2;
  public rotation = 0; // radians
  public angularVelocity = 0; // rad/s
  public mass: number;

  private forces: Vector2[] = [];
  private torques: number[] = [];
  private previousAcceleration: Vector2 = Vector2.zero();

  constructor(position: Vector2, velocity: Vector2, mass: number) {
    this.position = position.clone();
    this.velocity = velocity.clone();
    this.mass = mass;
  }

  /**
   * Apply force at center of mass
   * @param force Force vector (N)
   */
  applyForce(force: Vector2): void {
    this.forces.push(force.clone());
  }

  /**
   * Apply force at specific point (creates torque)
   * @param force Force vector (N)
   * @param applicationPoint Point relative to center of mass (m)
   */
  applyForceAtPoint(force: Vector2, applicationPoint: Vector2): void {
    this.forces.push(force.clone());

    // Calculate torque: τ = r × F (use right-hand rule)
    const torque = -applicationPoint.cross(force); // Negate for correct sign convention
    this.torques.push(torque);
  }

  /**
   * Apply torque directly
   * @param torque Torque magnitude (N⋅m)
   */
  applyTorque(torque: number): void {
    this.torques.push(torque);
  }

  /**
   * Get current acceleration from accumulated forces
   * @returns Acceleration vector (m/s²)
   */
  getAcceleration(): Vector2 {
    if (this.mass <= 0) return Vector2.zero();

    // Sum all forces
    const totalForce = this.forces.reduce((sum, force) => sum.add(force), Vector2.zero());

    return totalForce.divide(this.mass);
  }

  /**
   * Get current angular acceleration from accumulated torques
   * @param momentOfInertia Moment of inertia (kg⋅m²)
   * @returns Angular acceleration (rad/s²)
   */
  getAngularAcceleration(momentOfInertia: number): number {
    if (momentOfInertia <= 0) return 0;

    // Sum all torques
    const totalTorque = this.torques.reduce((sum, torque) => sum + torque, 0);
    return totalTorque / momentOfInertia;
  }

  /**
   * Integrate physics for one timestep
   * @param deltaTime Integration timestep (s)
   * @param momentOfInertia Moment of inertia for rotation (kg⋅m²)
   */
  integrate(deltaTime: number, momentOfInertia = 1000): void {
    const acceleration = this.getAcceleration();
    const angularAcceleration = this.getAngularAcceleration(momentOfInertia);

    // Check stability
    if (!PhysicsIntegrator.isStable(this.velocity, acceleration, deltaTime)) {
      console.warn('Physics integration unstable, clamping values');
      return;
    }

    // Integrate linear motion using semi-implicit Euler
    PhysicsIntegrator.integrateMotion(this.position, this.velocity, acceleration, deltaTime);

    // Integrate rotational motion
    this.angularVelocity += angularAcceleration * deltaTime;
    this.rotation += this.angularVelocity * deltaTime;

    // Normalize rotation to [0, 2π]
    this.rotation = ((this.rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    // Store acceleration for next frame (for Verlet if needed)
    this.previousAcceleration = acceleration;

    // Clear forces and torques for next frame
    this.clearForces();
  }

  /**
   * Clear all accumulated forces and torques
   */
  clearForces(): void {
    this.forces.length = 0;
    this.torques.length = 0;
  }

  /**
   * Get kinetic energy
   * @param momentOfInertia Moment of inertia (kg⋅m²)
   * @returns Kinetic energy (J)
   */
  getKineticEnergy(momentOfInertia: number): number {
    const linearKE = 0.5 * this.mass * this.velocity.magnitudeSquared();
    const rotationalKE = 0.5 * momentOfInertia * this.angularVelocity * this.angularVelocity;
    return linearKE + rotationalKE;
  }

  /**
   * Get momentum
   * @returns Momentum vector (kg⋅m/s)
   */
  getMomentum(): Vector2 {
    return this.velocity.multiply(this.mass);
  }

  /**
   * Set mass and update physics accordingly
   * @param newMass New mass (kg)
   */
  setMass(newMass: number): void {
    if (newMass <= 0) {
      console.warn('Invalid mass, keeping current mass');
      return;
    }
    this.mass = newMass;
  }

  /**
   * Get forward direction based on current rotation
   * @returns Forward direction vector
   */
  getForwardDirection(): Vector2 {
    return Vector2.fromAngle(this.rotation);
  }

  /**
   * Clone this rigid body
   * @returns New RigidBody with same properties
   */
  clone(): RigidBody {
    const clone = new RigidBody(this.position, this.velocity, this.mass);
    clone.rotation = this.rotation;
    clone.angularVelocity = this.angularVelocity;
    return clone;
  }
}

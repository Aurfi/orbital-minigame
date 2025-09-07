import { calculateDragForce } from '../physics/AtmosphericPhysics.js';
import type { RigidBody } from '../physics/RigidBody.js';
import { Vector2 } from '../physics/Vector2.js';
import type { WorldParameters } from '../physics/WorldParameters.js';
import type { EffectsSystem } from './EffectsSystem.js';
import type { RocketConfiguration } from './RocketConfiguration.js';
import type { SimpleSoundSystem } from './SimpleSoundSystem.js';
import type { GameState } from './types.js';

interface PhysicsContext {
  world: WorldParameters;
  rocketConfig: RocketConfiguration;
  rocketBody: RigidBody;
  gameState: GameState;
  effectsSystem: EffectsSystem;
  soundSystem: SimpleSoundSystem;
  padBaseAngle: number;
  aeroCdEff: number;
  aeroAreaEff: number;
  lastMach: number;
  lastAoADeg: number;
  debugLog: (...args: unknown[]) => void;
  getRocketBounds: () => { height: number };
  destroyRocket: (reason: string) => void;
}

/**
 * Handles all physics simulation for the rocket
 */
export class PhysicsSimulation {
  private context: PhysicsContext;

  constructor(context: PhysicsContext) {
    this.context = context;
  }

  updateContext(updates: Partial<PhysicsContext>): void {
    Object.assign(this.context, updates);
  }

  /**
   * Update physics simulation
   */
  updatePhysics(deltaTime: number): {
    aeroCdEff: number;
    aeroAreaEff: number;
    lastMach: number;
    lastAoADeg: number;
  } {
    const { gameState, rocketBody, rocketConfig, world, padBaseAngle, soundSystem } = this.context;

    // If rocket has never been launched, keep it fixed to launch pad
    if (!gameState.rocket.hasEverLaunched || gameState.rocket.isClamped) {
      this.keepRocketOnPad();
      return {
        aeroCdEff: this.context.aeroCdEff,
        aeroAreaEff: this.context.aeroAreaEff,
        lastMach: this.context.lastMach,
        lastAoADeg: this.context.lastAoADeg,
      };
    }

    // Ground support: if at ground contact and thrust insufficient, keep resting
    if (this.shouldStayGrounded()) {
      this.keepRocketGrounded();
      return {
        aeroCdEff: this.context.aeroCdEff,
        aeroAreaEff: this.context.aeroAreaEff,
        lastMach: this.context.lastMach,
        lastAoADeg: this.context.lastAoADeg,
      };
    }

    // Clear forces
    rocketBody.clearForces();

    // Apply gravity
    const gravityForce = this.calculateGravityForce();
    rocketBody.applyForce(gravityForce);

    // Apply thrust
    if (gameState.rocket.isEngineIgnited && gameState.rocket.throttle > 0) {
      const thrustForce = this.calculateThrustForce();
      rocketBody.applyForce(thrustForce);

      // Consume fuel
      const fuelConsumed = rocketConfig.consumeFuel(deltaTime, gameState.rocket.throttle);

      // Auto-shutdown engines if fuel depleted
      if (!fuelConsumed || rocketConfig.getCurrentThrust() === 0) {
        gameState.rocket.isEngineIgnited = false;
        gameState.rocket.throttle = 0;
        console.log('🔥 Fuel depleted! Engines automatically shut down.');
        soundSystem.stopEngine();
      }
    }

    // Apply atmospheric drag
    const altitude = world.getAltitude(rocketBody.position.magnitude());
    if (altitude < 80_000) {
      const dragResult = this.calculateDragForce();
      rocketBody.applyForce(dragResult.force);
      this.context.aeroCdEff = dragResult.cdEff;
      this.context.aeroAreaEff = dragResult.areaEff;
      this.context.lastMach = dragResult.mach;
      this.context.lastAoADeg = dragResult.aoaDeg;
    }

    // Update rocket mass
    rocketBody.setMass(rocketConfig.getCurrentMass());

    // Integrate physics
    rocketBody.integrate(deltaTime);

    // Check for ground collision
    if (world.isBelowSurface(rocketBody.position.magnitude())) {
      this.handleGroundCollision();
    }

    return {
      aeroCdEff: this.context.aeroCdEff,
      aeroAreaEff: this.context.aeroAreaEff,
      lastMach: this.context.lastMach,
      lastAoADeg: this.context.lastAoADeg,
    };
  }

  private keepRocketOnPad(): void {
    const { gameState, rocketBody, world, padBaseAngle } = this.context;
    const dims = this.context.getRocketBounds();
    const halfHeight = dims.height / 2;
    const nozzleDrop = 6;
    const centerRadius = world.planetRadius + halfHeight + nozzleDrop;

    const omega = world.earthRotationRate || 0;
    const angle = padBaseAngle + gameState.currentTime * omega;
    const newX = Math.cos(angle) * centerRadius;
    const newY = Math.sin(angle) * centerRadius;
    const newPos = new Vector2(newX, newY);
    const tan = new Vector2(-Math.sin(angle), Math.cos(angle)).multiply(omega * centerRadius);

    rocketBody.position = newPos;
    rocketBody.velocity = tan;
  }

  private shouldStayGrounded(): boolean {
    const { rocketBody, world, rocketConfig, gameState } = this.context;
    const dims = this.context.getRocketBounds();
    const halfHeight = dims.height / 2;
    const nozzleDrop = 6;
    const r = rocketBody.position.magnitude();
    const bottomAlt = r - (world.planetRadius + halfHeight + nozzleDrop);

    if (bottomAlt <= 1.5) {
      const g = world.getGravitationalAcceleration(r);
      const weight = rocketBody.mass * g;
      const thrust = rocketConfig.getCurrentThrust() * gameState.rocket.throttle;
      const twr = weight > 0 ? thrust / weight : 0;
      return twr <= 1.01;
    }
    return false;
  }

  private keepRocketGrounded(): void {
    const { gameState, rocketBody, world, padBaseAngle } = this.context;
    const dims = this.context.getRocketBounds();
    const halfHeight = dims.height / 2;
    const nozzleDrop = 6;
    const desiredCenter = world.planetRadius + halfHeight + nozzleDrop + 1;
    const omega = world.earthRotationRate || 0;
    const angle = padBaseAngle + gameState.currentTime * omega;

    const newPos = new Vector2(Math.cos(angle) * desiredCenter, Math.sin(angle) * desiredCenter);
    const groundVel = new Vector2(-Math.sin(angle), Math.cos(angle)).multiply(
      omega * desiredCenter
    );

    rocketBody.position = newPos;
    rocketBody.velocity = groundVel;
    gameState.rocket.isOnGround = true;
  }

  /**
   * Calculate gravitational force
   */
  calculateGravityForce(): Vector2 {
    const { rocketBody, world } = this.context;
    const position = rocketBody.position;
    const distance = position.magnitude();
    const gravity = world.getGravitationalAcceleration(distance);
    const direction = this.safeNormalize(position).multiply(-1);

    return direction.multiply(gravity * rocketBody.mass);
  }

  /**
   * Calculate thrust force
   */
  calculateThrustForce(): Vector2 {
    const { rocketBody, rocketConfig, gameState } = this.context;
    const thrust = rocketConfig.getCurrentThrust() * gameState.rocket.throttle;
    const direction = new Vector2(-Math.sin(rocketBody.rotation), Math.cos(rocketBody.rotation));

    return direction.multiply(thrust);
  }

  /**
   * Calculate atmospheric drag force with aerodynamic parameters
   */
  calculateDragForce(): {
    force: Vector2;
    cdEff: number;
    areaEff: number;
    mach: number;
    aoaDeg: number;
  } {
    const { rocketBody, world, rocketConfig } = this.context;
    const altitude = world.getAltitude(rocketBody.position.magnitude());

    // Strictly no aerodynamic effect at/above 80 km
    if (altitude >= 80_000) {
      return {
        force: Vector2.zero(),
        cdEff: rocketConfig.dragCoefficient,
        areaEff: rocketConfig.crossSectionalArea,
        mach: 0,
        aoaDeg: 0,
      };
    }

    const density = world.getAtmosphericDensity(altitude);

    // Air-relative velocity (subtract ground rotation)
    const airVel = rocketBody.velocity.subtract(this.getGroundVelocityAt(rocketBody.position));
    const speed = airVel.magnitude();

    if (speed < 0.01 || density <= 0) {
      return {
        force: Vector2.zero(),
        cdEff: rocketConfig.dragCoefficient,
        areaEff: rocketConfig.crossSectionalArea,
        mach: 0,
        aoaDeg: 0,
      };
    }

    // Angle of attack calculation
    const fwd = new Vector2(-Math.sin(rocketBody.rotation), Math.cos(rocketBody.rotation));
    const flow = airVel.multiply(-1 / speed);
    const dot = Math.max(-1, Math.min(1, fwd.x * flow.x + fwd.y * flow.y));
    const aoa = Math.acos(dot);

    // Mach number
    const a = world.getSpeedOfSound(altitude);
    const mach = speed / Math.max(1, a);

    // Effective area varies with attitude
    const aFront = rocketConfig.crossSectionalArea;
    const sideMul = 6;
    const sin2 = Math.sin(aoa) * Math.sin(aoa);
    const cos2 = 1 - sin2;
    const areaEff = aFront * (cos2 + sideMul * sin2);

    // Drag coefficient with AoA and Mach effects
    const cdBase = rocketConfig.dragCoefficient;
    const cdAoA = 1 + 4 * sin2;

    let cdMach = 1;
    if (mach >= 0.8 && mach <= 1.2) {
      const t = 1 - Math.abs(mach - 1) / 0.4;
      cdMach = 1 + 1.5 * Math.max(0, t);
    } else if (mach > 1.2) {
      cdMach = 1.1 + 0.1 * Math.min(1, (mach - 1.2) / 1.8);
    }

    const cdEff = cdBase * cdAoA * cdMach;

    return {
      force: calculateDragForce(airVel, density, cdEff, areaEff),
      cdEff,
      areaEff,
      mach,
      aoaDeg: (aoa * 180) / Math.PI,
    };
  }

  /**
   * Handle ground collision
   */
  handleGroundCollision(): void {
    const { rocketBody, world, effectsSystem, soundSystem, debugLog } = this.context;
    debugLog('Ground collision detected!');

    // Check relative impact speed
    const groundVel = this.getGroundVelocityAt(rocketBody.position);
    const impactSpeed = rocketBody.velocity.subtract(groundVel).magnitude();

    if (impactSpeed > 15.0) {
      debugLog(`💥 HIGH-SPEED GROUND IMPACT! Speed: ${impactSpeed.toFixed(1)} m/s - EXPLOSION!`);

      // Create explosion
      effectsSystem.createExplosion(
        this.context.gameState.rocket.position,
        this.context.gameState.rocket.velocity
      );
      soundSystem.playExplosion();

      // Destroy rocket
      this.context.destroyRocket('High-speed ground impact');
      return;
    }

    // Soft landing
    debugLog(`Soft landing! Impact speed: ${impactSpeed.toFixed(1)} m/s`);
    rocketBody.velocity = Vector2.zero();

    // Place rocket at ground contact
    const currentDistance = rocketBody.position.magnitude();
    const surfaceDistance = world.planetRadius;
    const dims = this.context.getRocketBounds();
    const halfHeight = dims.height / 2;
    const desiredCenter = surfaceDistance + halfHeight + 1;

    if (currentDistance < desiredCenter) {
      const normalizedPos = this.safeNormalize(rocketBody.position);
      rocketBody.position = normalizedPos.multiply(desiredCenter);
    }
  }

  /**
   * Get ground tangential velocity at position due to planet rotation
   */
  getGroundVelocityAt(pos: Vector2): Vector2 {
    const { world } = this.context;
    const omega = world.earthRotationRate || 0;
    const r = pos.magnitude();
    if (r < 1e-6 || omega === 0) return Vector2.zero();
    const u = this.safeNormalize(pos);
    const t = new Vector2(-u.y, u.x);
    return t.multiply(omega * r);
  }

  private safeNormalize(vector: Vector2): Vector2 {
    const magnitude = vector.magnitude();
    if (magnitude < 0.001) {
      return new Vector2(0, -1);
    }
    try {
      return vector.normalized();
    } catch {
      return new Vector2(vector.x / magnitude, vector.y / magnitude);
    }
  }
}

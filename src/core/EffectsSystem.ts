import { Vector2 } from '../physics/Vector2.js';
import type { WorldParameters } from '../physics/WorldParameters.js';
import type { CanvasRenderer } from '../rendering/CanvasRenderer.js';
import { StagingVisuals } from '../rendering/StagingVisuals.js';
import type { GameState } from './types.js';

interface VelocityStreak {
  pos: Vector2;
  vel: Vector2;
  life: number;
  intensity: number;
}

/**
 * Manages all visual effects: explosions, smoke, debris, speed streaks, atmospheric glow
 */
export class EffectsSystem {
  private stagingVis: StagingVisuals;
  private velocityStreaks: VelocityStreak[] = [];
  private atmosphericGlow = 0;
  private heatLevel = 0;
  private hasBurnedUp = false;

  constructor() {
    this.stagingVis = new StagingVisuals();
  }

  /**
   * Reset all effects
   */
  reset(): void {
    this.stagingVis = new StagingVisuals();
    this.velocityStreaks = [];
    this.atmosphericGlow = 0;
    this.heatLevel = 0;
    this.hasBurnedUp = false;
  }

  /**
   * Update all effects
   */
  update(deltaTime: number): void {
    // Update staging visuals (smoke, debris, explosions)
    this.stagingVis.update(deltaTime);

    // Update velocity streaks
    for (let i = this.velocityStreaks.length - 1; i >= 0; i--) {
      const streak = this.velocityStreaks[i];
      streak.life -= deltaTime * 2;
      streak.pos = streak.pos.add(streak.vel.multiply(deltaTime));

      if (streak.life <= 0) {
        this.velocityStreaks.splice(i, 1);
      }
    }
  }

  /**
   * Render all effects
   */
  render(renderer: CanvasRenderer, rocket: GameState['rocket']): void {
    // Draw effects behind rocket
    this.stagingVis.drawBehind(renderer);

    // Draw speed effects
    this.drawSpeedEffects(renderer);

    // Atmospheric heating glow removed - was causing unwanted ring effect

    // Note: Front effects drawn after rocket in main render loop
  }

  /**
   * Render effects that go in front of rocket
   */
  renderFront(renderer: CanvasRenderer): void {
    this.stagingVis.drawFront(renderer);
  }

  /**
   * Update speed-based effects
   */
  updateSpeedEffects(
    deltaTime: number,
    gameState: GameState,
    world: WorldParameters,
    rocketDown: Vector2,
    bottomDistance: number
  ): void {
    const velocity = gameState.rocket.velocity;
    const speed = velocity.magnitude();
    const position = gameState.rocket.position;
    const altitude = world.getAltitude(position.magnitude());
    const rotation = gameState.rocket.rotation;
    const engineBase = position.add(rocketDown.multiply(bottomDistance));

    // Get atmospheric density
    const atmosphericDensity = world.getAtmosphericDensity(altitude);

    // Calculate effect intensity based on speed and atmospheric density
    const speedThreshold = 50; // m/s
    const maxSpeed = 1000; // m/s
    const speedFactor = Math.min(
      1,
      Math.max(0, (speed - speedThreshold) / (maxSpeed - speedThreshold))
    );

    // Effect intensity scales with both speed and atmospheric density
    const effectIntensity = speedFactor * atmosphericDensity;

    // Update atmospheric glow for heating effects
    this.atmosphericGlow = effectIntensity;

    // Create velocity streaks when moving fast in atmosphere
    if (effectIntensity > 0.1 && Math.random() < effectIntensity) {
      const streakOffset = new Vector2((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);

      this.velocityStreaks.push({
        pos: engineBase.add(streakOffset),
        vel: velocity
          .multiply(-0.5)
          .add(new Vector2((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10)),
        life: 0.5 + Math.random() * 0.5,
        intensity: effectIntensity,
      });
    }

    // Limit velocity streaks
    if (this.velocityStreaks.length > 30) {
      this.velocityStreaks.splice(0, this.velocityStreaks.length - 30);
    }
  }

  /**
   * Create smoke effects from engine
   */
  createEngineSmoke(
    gameState: GameState,
    world: WorldParameters,
    rocketDown: Vector2,
    engineBase: Vector2
  ): void {
    const position = gameState.rocket.position;
    const velocity = gameState.rocket.velocity;
    const altitude = world.getAltitude(position.magnitude());

    // Smoke only visible in atmosphere
    if (altitude > 50000 || !gameState.rocket.isEngineIgnited) return;

    const atmosphericDensity = world.getAtmosphericDensity(altitude);
    const smokeIntensity = Math.min(1, atmosphericDensity * 2);

    if (smokeIntensity > 0.01) {
      // Create multiple smoke particles
      const smokeCount = Math.floor(3 * smokeIntensity * gameState.rocket.throttle);

      for (let i = 0; i < smokeCount; i++) {
        const jitter = new Vector2((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
        const down = rocketDown.multiply(5 + Math.random() * 3);
        const smokePos = new Vector2(
          engineBase.x + down.x + jitter.x,
          engineBase.y + down.y + jitter.y
        );

        // Smoke velocity
        const ejectSpeed = 90 + 140 * gameState.rocket.throttle;
        const dir = rocketDown;
        const smokeVel = new Vector2(
          dir.x * ejectSpeed + velocity.x * 0.15 + (Math.random() - 0.5) * 12,
          dir.y * ejectSpeed + velocity.y * 0.15 + (Math.random() - 0.5) * 12
        );

        this.stagingVis.addSmoke(
          smokePos,
          smokeVel,
          (4 + Math.random() * 8) * smokeIntensity,
          3.0 * smokeIntensity
        );
      }
    }
  }

  /**
   * Create an explosion effect
   */
  createExplosion(position: Vector2, velocity: Vector2): void {
    this.stagingVis.createExplosion(position.clone(), velocity.multiply(0.1));
  }

  /**
   * Create debris for rocket destruction
   */
  createDestructionDebris(position: Vector2, velocity: Vector2): void {
    for (let i = 0; i < 20; i++) {
      const pos = position.add(new Vector2((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50));
      const vel = velocity.add(
        new Vector2((Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100)
      );
      this.stagingVis.addDebris(
        pos,
        vel,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 10,
        3.0 + Math.random() * 2.0
      );
    }
  }

  /**
   * Draw speed effects
   */
  private drawSpeedEffects(renderer: CanvasRenderer): void {
    // Draw velocity streaks
    for (const streak of this.velocityStreaks) {
      const alpha = Math.max(0, streak.life) * streak.intensity;
      const size = 2 + streak.intensity * 3;

      renderer.drawCircle(streak.pos, size, `rgba(255, 200, 100, ${alpha * 0.5})`, undefined, 0);
    }
  }

  // Getters and setters for atmospheric effects
  getAtmosphericGlow(): number {
    return this.atmosphericGlow;
  }

  setAtmosphericGlow(value: number): void {
    this.atmosphericGlow = value;
  }

  getHeatLevel(): number {
    return this.heatLevel;
  }

  setHeatLevel(value: number): void {
    this.heatLevel = value;
  }

  hasBurnedUpStatus(): boolean {
    return this.hasBurnedUp;
  }

  setHasBurnedUp(value: boolean): void {
    this.hasBurnedUp = value;
  }
}

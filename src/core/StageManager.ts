import { Vector2 } from '../physics/Vector2.js';
import type { WorldParameters } from '../physics/WorldParameters.js';
import type { CanvasRenderer } from '../rendering/CanvasRenderer.js';
import { StagingVisuals } from '../rendering/StagingVisuals.js';
import type { GameState } from './types.js';

interface SeparatedStage {
  pos: Vector2;
  vel: Vector2;
  rotation: number;
  rotSpeed: number;
  life: number;
  stageIndex: number;
  bornTime: number;
  age: number;
  landed?: boolean;
}

/**
 * Manages rocket staging animations and separated stage physics
 */
export class StageManager {
  private separatedStages: SeparatedStage[] = [];
  private stagingVis: StagingVisuals;
  private lastStagingTime = 0;

  constructor() {
    this.stagingVis = new StagingVisuals();
  }

  /**
   * Reset all staging animations
   */
  reset(): void {
    this.separatedStages = [];
    this.stagingVis = new StagingVisuals();
    this.lastStagingTime = 0;
  }

  /**
   * Create staging animation when a stage separates
   */
  createStagingAnimation(
    gameState: GameState,
    rocketDown: Vector2,
    exhaustLocalY: number | undefined,
    rocketHeight: number
  ): void {
    this.lastStagingTime = gameState.currentTime;

    const position = gameState.rocket.position;
    const velocity = gameState.rocket.velocity;
    const currentStageIndex = gameState.rocket.currentStage - 1;

    // Separation: drift gently down along rocket orientation
    const separationVel = velocity.add(rocketDown.multiply(5));

    // Spawn 20-25px below the current stage bottom
    let bottomDistance: number;
    if (typeof exhaustLocalY === 'number') {
      bottomDistance = Math.max(10, -exhaustLocalY);
    } else {
      bottomDistance = Math.max(10, rocketHeight / 2);
    }

    const baseBottom = position.add(rocketDown.multiply(bottomDistance));
    const offset = 20 + Math.random() * 5;
    const separatedStagePos = baseBottom.add(rocketDown.multiply(offset));

    this.separatedStages.push({
      pos: separatedStagePos,
      vel: separationVel,
      rotation: gameState.rocket.rotation,
      rotSpeed: 0,
      life: 30.0, // Visible for 30 seconds
      stageIndex: Math.max(0, currentStageIndex),
      bornTime: gameState.currentTime,
      age: 0,
      landed: false,
    });

    // Create debris pieces
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const speed = 10 + Math.random() * 20;
      const dv = new Vector2(
        velocity.x + Math.cos(angle) * speed,
        velocity.y + Math.sin(angle) * speed
      );
      this.stagingVis.addDebris(
        position,
        dv,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 10,
        2.0
      );
    }
  }

  /**
   * Update physics for separated stages
   */
  update(
    deltaTime: number,
    world: WorldParameters,
    renderer: CanvasRenderer,
    createExplosion: (pos: Vector2, vel: Vector2) => void
  ): void {
    // Update separated stages
    for (let i = this.separatedStages.length - 1; i >= 0; i--) {
      const stage = this.separatedStages[i];

      if (stage.landed) {
        // Keep landed stages in place
        stage.life -= deltaTime * 0.0; // Keep indefinitely
        if (stage.life <= 0) {
          this.separatedStages.splice(i, 1);
        }
        continue;
      }

      stage.age += deltaTime;

      // Apply gravity
      const gravityMagnitude = world.getGravitationalAcceleration(stage.pos.magnitude());
      const positionMagnitude = stage.pos.magnitude();
      let gravityDirection: Vector2;

      if (positionMagnitude < 0.001) {
        gravityDirection = new Vector2(0, -1);
      } else {
        gravityDirection = stage.pos.multiply(-1 / positionMagnitude);
      }

      const gravityAccel = gravityDirection.multiply(gravityMagnitude);
      stage.vel = stage.vel.add(gravityAccel.multiply(deltaTime));

      // Check ground collision
      const stageAltitude = world.getAltitude(stage.pos.magnitude());
      if (stageAltitude <= 0) {
        const impactSpeed = stage.vel.magnitude();
        if (impactSpeed > 15) {
          // Hard impact - explode
          createExplosion(stage.pos, stage.vel);
          this.separatedStages.splice(i, 1);
          continue;
        }
        // Soft landing
        const surfaceNorm =
          positionMagnitude > 0.001 ? stage.pos.multiply(1 / positionMagnitude) : new Vector2(0, 1);
        stage.pos = surfaceNorm.multiply(world.planetRadius + 1);
        stage.vel = Vector2.zero();
        stage.landed = true;
      }

      if (!stage.landed) {
        stage.pos = stage.pos.add(stage.vel.multiply(deltaTime));
      }

      stage.life -= deltaTime;

      // Cull if far off screen
      const screenPos = renderer.worldToScreen(stage.pos);
      const viewSize = renderer.getSize();
      if (!stage.landed && screenPos.y > viewSize.y + 120) {
        stage.life = 0;
      }

      if (stage.life <= 0) {
        this.separatedStages.splice(i, 1);
      }
    }

    // Update staging visuals
    this.stagingVis.update(deltaTime);
  }

  /**
   * Render separated stages and debris
   */
  render(renderer: CanvasRenderer): void {
    // Draw separated stages
    for (const stage of this.separatedStages) {
      const alpha = Math.max(0, Math.min(1, stage.life / 30.0));

      renderer.drawRotated(stage.pos, stage.rotation, () => {
        if (stage.stageIndex === 0) {
          // First stage - larger
          renderer.drawRectangle(
            new Vector2(-8, -25),
            16,
            50,
            `rgba(240, 240, 240, ${alpha})`,
            `rgba(44, 90, 160, ${alpha})`,
            2
          );
        } else {
          // Upper stages - smaller
          renderer.drawRectangle(
            new Vector2(-6, -18),
            12,
            36,
            `rgba(255, 255, 255, ${alpha})`,
            `rgba(192, 57, 43, ${alpha})`,
            2
          );
        }
      });
    }

    // Debris drawing handled separately by StagingVisuals
  }

  /**
   * Get staging animation time for smoke effects
   */
  getStagingAnimationTime(currentTime: number): number {
    return currentTime - this.lastStagingTime;
  }
}

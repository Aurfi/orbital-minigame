import type { RigidBody } from '../physics/RigidBody.js';
import { Vector2 } from '../physics/Vector2.js';
import type { RocketRenderer } from '../rendering/RocketRenderer.js';
import type { EffectsSystem } from './EffectsSystem.js';
import type { RocketConfiguration } from './RocketConfiguration.js';
import type { SimpleSoundSystem } from './SimpleSoundSystem.js';
import type { StageManager } from './StageManager.js';
import type { GameState } from './types.js';

interface CommandContext {
  gameState: GameState;
  rocketBody: RigidBody;
  rocketConfig: RocketConfiguration;
  soundSystem: SimpleSoundSystem;
  effectsSystem: EffectsSystem;
  stageManager: StageManager;
  rocketRenderer: RocketRenderer;
  debugLog: (...args: unknown[]) => void;
  destroyRocket: (reason: string) => void;
}

/**
 * Executes rocket commands (ignite, throttle, staging)
 */
export class CommandExecutor {
  private context: CommandContext;

  constructor(context: CommandContext) {
    this.context = context;
  }

  updateContext(updates: Partial<CommandContext>): void {
    Object.assign(this.context, updates);
  }

  /**
   * Ignite engines
   */
  igniteEngines(): boolean {
    const { gameState, rocketConfig, soundSystem, debugLog } = this.context;

    // Check if current stage has fuel
    const activeStage = rocketConfig.getActiveStage();
    if (!activeStage || activeStage.fuelRemaining <= 0) {
      debugLog('❌ Cannot ignite - no fuel remaining in current stage!');
      return false;
    }

    const thrust = rocketConfig.getCurrentThrust();
    debugLog(`Attempting ignition - thrust: ${thrust}, fuel: ${activeStage.fuelRemaining}kg`);

    if (thrust > 0) {
      gameState.rocket.isEngineIgnited = true;
      gameState.rocket.hasEverLaunched = true;

      // Auto-set some throttle for easier testing
      gameState.rocket.throttle = 0.5;

      // Auto-release pad clamps on initial ignition
      if (gameState.rocket.isClamped) {
        gameState.rocket.isClamped = false;
        debugLog('🧰 Pad clamps auto-released. Liftoff!');
      }

      debugLog('✅ Engine start! Throttle 50%');
      soundSystem.playEngineIgnite();
      return true;
    }

    debugLog('❌ No thrust available - ignition failed');
    return false;
  }

  /**
   * Set throttle
   */
  setThrottle(value: number): void {
    const { gameState, soundSystem, debugLog } = this.context;

    gameState.rocket.throttle = Math.max(0, Math.min(1, value));
    debugLog(`Throttle set to ${(gameState.rocket.throttle * 100).toFixed(0)}%`);

    // Update engine sound
    if (gameState.rocket.isEngineIgnited) {
      soundSystem.setEngineThrottle(gameState.rocket.throttle);
    }
  }

  /**
   * Cut engines
   */
  cutEngines(): void {
    const { gameState, soundSystem, debugLog } = this.context;

    gameState.rocket.isEngineIgnited = false;
    gameState.rocket.throttle = 0;
    debugLog('🔥 Engines cut! Complete engine shutdown.');
    soundSystem.stopEngine();
  }

  /**
   * Perform staging
   */
  performStaging(): boolean {
    const {
      gameState,
      rocketBody,
      rocketConfig,
      effectsSystem,
      soundSystem,
      stageManager,
      rocketRenderer,
      debugLog,
      destroyRocket,
    } = this.context;

    const currentThrust = rocketConfig.getCurrentThrust() * gameState.rocket.throttle;

    // Check if this would cause explosion (engines on)
    if (rocketConfig.wouldExplodeOnStaging(currentThrust)) {
      debugLog('💥 EXPLOSION! Cannot stage with engines firing - catastrophic failure!');

      // Create explosion
      effectsSystem.createExplosion(gameState.rocket.position, gameState.rocket.velocity);
      soundSystem.playExplosion();

      // Destroy rocket
      destroyRocket('Staging while engines firing');
      return false;
    }

    // Store current physics state before staging
    const currentPosition = rocketBody.position.clone();
    const currentVelocity = rocketBody.velocity.clone();

    if (rocketConfig.performStaging()) {
      // Update game state
      gameState.rocket.currentStage = rocketConfig.getCurrentStageIndex();

      // Preserve position and velocity
      rocketBody.position = currentPosition;
      rocketBody.velocity = currentVelocity;

      // Update mass
      rocketBody.setMass(rocketConfig.getCurrentMass());

      // Create staging animation
      const rocketDown = new Vector2(
        Math.sin(gameState.rocket.rotation),
        -Math.cos(gameState.rocket.rotation)
      );
      const dims = rocketRenderer.getRocketBounds(gameState.rocket);

      stageManager.createStagingAnimation(
        gameState,
        rocketDown,
        gameState.rocket.exhaustY,
        dims.height
      );

      debugLog('✅ Stage separated safely! Position and velocity preserved.');
      return true;
    }

    debugLog('Cannot stage - no more stages available');
    return false;
  }

  /**
   * Nudge throttle by delta
   */
  nudgeThrottle(delta: number): void {
    const t = Math.max(0, Math.min(1, this.context.gameState.rocket.throttle + delta));
    this.setThrottle(t);
  }
}

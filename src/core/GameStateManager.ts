import { RigidBody } from '../physics/RigidBody.js';
import { Vector2 } from '../physics/Vector2.js';
import { WorldParameters } from '../physics/WorldParameters.js';
import type { RocketRenderer } from '../rendering/RocketRenderer.js';
import { computeApoPeri } from './Navigator.js';
import { RocketConfiguration } from './RocketConfiguration.js';
import type { SimpleSoundSystem } from './SimpleSoundSystem.js';
import type { GameState } from './types.js';

interface StateContext {
  canvas: HTMLCanvasElement;
  rocketRenderer: RocketRenderer;
  soundSystem: SimpleSoundSystem;
  debugLog: (...args: unknown[]) => void;
}

/**
 * Manages game state initialization, updates, and transitions
 */
export class GameStateManager {
  private context: StateContext;
  private successSpacePlayed = false;
  private successOrbitPlayed = false;
  private isGameOver = false;
  private gameOverTimer = 0;
  private explosionPhase = false;
  private explosionTimer = 0;
  private gameOverReason = '';
  public menuButtonBounds?: { x: number; y: number; width: number; height: number };

  constructor(context: StateContext) {
    this.context = context;
  }

  /**
   * Initialize game state with default values
   */
  initializeGameState(): {
    gameState: GameState;
    rocketBody: RigidBody;
    rocketConfig: RocketConfiguration;
    padBaseAngle: number;
  } {
    const rocketConfig = RocketConfiguration.createTutorialRocket();
    const world = new WorldParameters();

    // Start rocket on launch pad at the top of the planet
    const launchPosition = new Vector2(0, world.planetRadius);
    const launchVelocity = Vector2.zero();

    const rocketBody = new RigidBody(launchPosition, launchVelocity, rocketConfig.getCurrentMass());

    // Set rocket rotation to point up
    rocketBody.rotation = 0;

    const gameState: GameState = {
      isRunning: false,
      isPaused: false,
      timeWarp: 1.0,
      currentTime: 0,
      world: world,
      rocket: {
        position: launchPosition.clone(),
        velocity: launchVelocity.clone(),
        rotation: 0,
        mass: rocketConfig.getCurrentMass(),
        fuel: rocketConfig.stages.reduce((sum, stage) => sum + stage.fuelRemaining, 0),
        throttle: 0,
        isEngineIgnited: false,
        hasEverLaunched: false,
        isClamped: true,
        isOnGround: true,
        currentStage: 0,
        stages: rocketConfig.stages,
      },
      autopilotEnabled: true,
    };

    // Adjust initial position for visual alignment
    const dims = this.context.rocketRenderer.getRocketBounds(gameState.rocket);
    const halfHeight = dims.height / 2;
    const nozzleDrop = 6;
    const padClearance = 0;
    rocketBody.position = launchPosition.add(
      new Vector2(0, halfHeight + nozzleDrop + padClearance)
    );
    gameState.rocket.position = rocketBody.position.clone();

    // Base angle for pad alignment
    const padBaseAngle = Math.atan2(rocketBody.position.y, rocketBody.position.x);

    return { gameState, rocketBody, rocketConfig, padBaseAngle };
  }

  /**
   * Reset state for restart
   */
  resetState(): void {
    this.successSpacePlayed = false;
    this.successOrbitPlayed = false;
    this.isGameOver = false;
    this.gameOverTimer = 0;
    this.explosionPhase = false;
    this.explosionTimer = 0;
    this.gameOverReason = '';
  }

  /**
   * Update rocket state from physics body
   */
  updateRocketState(
    gameState: GameState,
    rocketBody: RigidBody,
    rocketConfig: RocketConfiguration,
    visualRotation: number,
    autopilotRunning: boolean,
    aeroCdEff: number,
    aeroAreaEff: number
  ): void {
    gameState.rocket.position = rocketBody.position.clone();
    gameState.rocket.velocity = rocketBody.velocity.clone();
    gameState.rocket.rotation = rocketBody.rotation;
    gameState.rocket.visualRotation = visualRotation;
    gameState.rocket.mass = rocketBody.mass;
    gameState.rocket.stages = rocketConfig.stages;
    gameState.autopilotRunning = autopilotRunning;
    gameState.rocket.dragCoefficient = aeroCdEff;
    gameState.rocket.crossSectionalArea = aeroAreaEff;
    gameState.rocket.fuel = rocketConfig.stages.reduce(
      (sum, stage) => sum + stage.fuelRemaining,
      0
    );
  }

  /**
   * Check and play success sounds
   */
  checkSuccessSounds(gameState: GameState): void {
    const world = gameState.world;
    const pos = gameState.rocket.position;
    const vel = gameState.rocket.velocity;
    const alt = world.getAltitude(pos.magnitude());

    // Reached space (Kármán line)
    if (!this.successSpacePlayed && alt >= 100_000) {
      this.successSpacePlayed = true;
      this.context.soundSystem.playSuccess();
    }

    // Stable orbit: closed ellipse with perigee above 80 km
    if (!this.successOrbitPlayed) {
      const mu = world.gravitationalParameter;
      const res = computeApoPeri(pos, vel, mu, world.planetRadius);

      if (Number.isFinite(res.periAlt) && res.periAlt > 80_000) {
        this.successOrbitPlayed = true;
        this.context.soundSystem.playSuccess();
      }
    }
  }

  /**
   * Start explosion phase
   */
  startExplosion(reason: string): void {
    this.explosionPhase = true;
    this.explosionTimer = 0;
    this.gameOverReason = reason;
    this.context.debugLog(`🚀💥 ROCKET DESTROYED! ${reason}`);
  }

  /**
   * Update explosion phase
   */
  updateExplosion(deltaTime: number): boolean {
    if (!this.explosionPhase) return false;

    this.explosionTimer += deltaTime;
    if (this.explosionTimer >= 2.0) {
      this.explosionPhase = false;
      this.isGameOver = true;
      this.gameOverTimer = 0;
      return false;
    }
    return true;
  }

  /**
   * Update game over state
   */
  updateGameOver(deltaTime: number): { shouldRestart: boolean; autopilot?: boolean } {
    if (!this.isGameOver) return { shouldRestart: false };

    this.gameOverTimer += deltaTime;
    // No auto-restart anymore - user must click Menu button
    return { shouldRestart: false };
  }

  /**
   * Render game over screen
   */
  renderGameOverScreen(): void {
    if (!this.isGameOver) return;

    const ctx = this.context.canvas.getContext('2d');
    if (!ctx) return;

    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, this.context.canvas.width, this.context.canvas.height);

    // Game over text
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      'MISSION FAILED',
      this.context.canvas.width / 2,
      this.context.canvas.height / 2 - 40
    );

    ctx.fillStyle = '#ffffff';
    ctx.font = '24px monospace';
    const reason = this.gameOverReason || 'Vehicle destroyed';
    ctx.fillText(reason, this.context.canvas.width / 2, this.context.canvas.height / 2 + 20);

    // Menu button
    const buttonWidth = 80;
    const buttonHeight = 30;
    const buttonX = this.context.canvas.width / 2 - buttonWidth / 2;
    const buttonY = this.context.canvas.height / 2 + 60;

    // Store button bounds for click detection
    this.menuButtonBounds = {
      x: buttonX,
      y: buttonY,
      width: buttonWidth,
      height: buttonHeight,
    };

    // Draw button (red)
    ctx.fillStyle = '#aa2222';
    ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
    ctx.strokeStyle = '#ff6666';
    ctx.lineWidth = 2;
    ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);

    // Button text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MENU', this.context.canvas.width / 2, buttonY + buttonHeight / 2 + 5);

    ctx.textAlign = 'left';
  }

  // Getters
  isExplosionPhase(): boolean {
    return this.explosionPhase;
  }

  isGameOverState(): boolean {
    return this.isGameOver;
  }

  getGameOverReason(): string {
    return this.gameOverReason;
  }
}

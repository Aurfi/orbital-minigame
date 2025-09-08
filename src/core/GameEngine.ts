import { calculateDragForce } from '../physics/AtmosphericPhysics.js';
import { PhysicsIntegrator } from '../physics/PhysicsIntegrator.js';
import type { RigidBody } from '../physics/RigidBody.js';
import { Vector2 } from '../physics/Vector2.js';
import { WorldParameters } from '../physics/WorldParameters.js';
import { BackgroundSystem } from '../rendering/BackgroundSystem.js';
import { Camera, CanvasRenderer } from '../rendering/CanvasRenderer.js';
import { PlanetRenderer } from '../rendering/PlanetRenderer.js';
import { RocketRenderer } from '../rendering/RocketRenderer.js';
import { AtmosphereUI } from '../ui/AtmosphereUI.js';
import { FactBubblesSystem } from '../ui/FactBubbles.js';
import { HUDSystem } from '../ui/HUDSystem.js';
import { enforceAtmosphericLimits } from './AtmosphereLimiter.js';
import { Autopilot } from './Autopilot.js';
import { CommandExecutor } from './CommandExecutor.js';
import { EffectsSystem } from './EffectsSystem.js';
import { GameStateManager } from './GameStateManager.js';
import { updateGuidance, updateVisualGuidance } from './GuidanceSystem.js';
import { InputController } from './InputController.js';
import { computeApoPeri } from './Navigator.js';
import { PhysicsSimulation } from './PhysicsSimulation.js';
import type { RocketConfiguration } from './RocketConfiguration.js';
import { SimpleSoundSystem } from './SimpleSoundSystem.js';
import { StageManager } from './StageManager.js';
import type { GameState } from './types.js';

// Main game engine class
export class GameEngine {
  private canvas: HTMLCanvasElement;
  private renderer: CanvasRenderer;
  private camera: Camera;
  private hudSystem: HUDSystem;
  private rocketRenderer: RocketRenderer;
  private background: BackgroundSystem;
  private planetRenderer: PlanetRenderer;
  private physicsIntegrator: PhysicsIntegrator;
  private stageManager: StageManager;
  private effectsSystem: EffectsSystem;
  private soundSystem: SimpleSoundSystem;
  private physicsSimulation: PhysicsSimulation;
  private stateManager: GameStateManager;
  private commandExecutor: CommandExecutor;

  private gameState!: GameState;
  private rocketBody!: RigidBody;
  private rocketConfig!: RocketConfiguration;

  private isRunning = false;
  private lastTime = 0;
  private animationFrameId = 0;

  // Atmosphere notifications
  private atmosphereUI!: AtmosphereUI;
  private gameStartTime = 0;
  private missionTimer = 0;

  // Game over system - now managed by stateManager

  // Game speed controls
  private gameSpeed = 2; // Base game speed is 2x (displayed as 1x)

  // HUD visibility (debug helper). Handy to isolate rendering issues.
  private showHUD = true;

  private padBaseAngle: number = Math.PI / 2; // base ground angle for pad/site (π/2 = top)
  private autopilot?: Autopilot;
  private autopilotEnabled = false;
  private pendingAutopilotMode: boolean | null = null;
  private apHold: 'none' | 'prograde' | 'retrograde' | 'up' | 'target' = 'none';
  private apTargetRot: number | null = null;
  private apLogger: ((msg: string) => void) | null = null; // small log hook for console
  private factSystem?: FactBubblesSystem;
  // simple logger for dev: prints only when debugEnabled
  private debugLog(...args: unknown[]): void {
    if (this.debugEnabled) console.log(...args);
  }

  // Helper: safe normalization with fallback values
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

  // Aerodynamics (effective values for HUD/limits)
  // Computed each frame from attitude and Mach to reflect current airflow.
  private aeroCdEff = 0.3;
  private aeroAreaEff = 10;
  private lastMach = 0;
  private lastAoADeg = 0;
  private overspeedTime = 0; // Track overspeed duration for grace period

  // Attitude control (slow turning)
  private turnLeft = false;
  private turnRight = false;
  private angularVelocity = 0; // rad/s
  private readonly maxTurnRate: number = 0.12; // rad/s (~6.9°/s)
  private readonly angularAccel: number = 0.5; // rad/s^2
  private visualRotation = 0; // smoothed rotation for rendering
  // Debug controls
  private debugEnabled = false;
  private lastDebugLogTime = 0;
  private lastSoundDensity = -1; // Track last sound density to avoid constant updates

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new CanvasRenderer(canvas);
    // Initialize camera - will be set properly in initializeGameState
    this.camera = new Camera(Vector2.zero(), 0.1);
    this.hudSystem = new HUDSystem(canvas);
    this.rocketRenderer = new RocketRenderer();
    this.physicsIntegrator = new PhysicsIntegrator();
    this.autopilot = new Autopilot(this);
    this.background = new BackgroundSystem();
    this.planetRenderer = new PlanetRenderer();
    this.stageManager = new StageManager();
    this.effectsSystem = new EffectsSystem();
    this.soundSystem = new SimpleSoundSystem(true);

    // Initialize state manager
    this.stateManager = new GameStateManager({
      canvas: this.canvas,
      rocketRenderer: this.rocketRenderer,
      soundSystem: this.soundSystem,
      debugLog: (...args) => this.debugLog(...args),
    });

    // Physics and commands will be initialized after game state

    this.renderer.setCamera(this.camera);

    // Initialize game state first
    this.initializeGameState();

    // Setup camera to proper initial position and zoom
    this.camera.setTarget(this.gameState.rocket.position);
    this.camera.position = this.gameState.rocket.position.clone();
    this.camera.setZoom(0.8); // Start more zoomed in for detailed rocket view

    // Initialize timer and show welcome message
    this.gameStartTime = Date.now();
    this.missionTimer = 0;
    this.atmosphereUI = new AtmosphereUI(this.canvas);
    this.atmosphereUI.addMessage('Good luck!', 0, 3.0);

    // Setup event listeners
    this.setupEventListeners();
    // Facts system
    this.factSystem = new FactBubblesSystem(this.canvas);
    // Single mode (manual) — scripts can run any time
    this.gameState.autopilotEnabled = false;
  }

  toggleAutopilot(): void {
    this.autopilotEnabled = !this.autopilotEnabled;
    this.gameState.autopilotEnabled = this.autopilotEnabled;
    // Notify UI outside canvas to show/hide the console
    document.dispatchEvent(
      new CustomEvent('autopilot-toggle', { detail: { enabled: this.autopilotEnabled } })
    );
  }

  // UI helper: show a small on-screen info message
  showInfo(text: string, duration = 2.5): void {
    this.atmosphereUI.addMessage(text, this.gameState.currentTime, duration);
  }

  isAutopilotOn(): boolean {
    return this.autopilotEnabled;
  }

  /** Get apoapsis altitude estimate (m) using navigator helper. */
  getApoapsisAltitude(): number {
    const mu = this.gameState.world.gravitationalParameter;
    const R = this.gameState.world.planetRadius;
    const res = computeApoPeri(
      this.gameState.rocket.position,
      this.gameState.rocket.velocity,
      mu,
      R
    );
    return Number.isFinite(res.apoAlt) ? res.apoAlt : Number.POSITIVE_INFINITY;
  }

  /** Get periapsis altitude estimate (m) using navigator helper. */
  getPeriapsisAltitude(): number {
    const mu = this.gameState.world.gravitationalParameter;
    const R = this.gameState.world.planetRadius;
    const res = computeApoPeri(
      this.gameState.rocket.position,
      this.gameState.rocket.velocity,
      mu,
      R
    );
    return res.periAlt;
  }

  /** Radial velocity (m/s): positive when moving away from planet center. */
  getRadialVelocity(): number {
    const p = this.gameState.rocket.position;
    const v = this.gameState.rocket.velocity;
    const r = Math.hypot(p.x, p.y);
    if (r < 1e-6) return 0;
    const ux = p.x / r;
    const uy = p.y / r;
    return v.x * ux + v.y * uy;
  }

  /** Current altitude above surface (m). */
  getAltitude(): number {
    return this.gameState.world.getAltitude(this.gameState.rocket.position.magnitude());
  }

  /** Fuel remaining (kg) in the active stage, or NaN if not available. */
  getActiveStageFuel(): number {
    try {
      const idx = this.rocketConfig.getCurrentStageIndex();
      const st = this.rocketConfig.stages[idx];
      return typeof st?.fuelRemaining === 'number' ? st.fuelRemaining : Number.NaN;
    } catch {
      return Number.NaN;
    }
  }

  /**
   * Check and play success sounds for reaching space and stable orbit.
   */
  private checkSuccessSounds(): void {
    this.stateManager.checkSuccessSounds(this.gameState);
  }

  /**
   * Initialize the game state with default values
   */
  private initializeGameState(): void {
    // Use state manager to initialize
    const result = this.stateManager.initializeGameState();
    this.gameState = result.gameState;
    this.rocketBody = result.rocketBody;
    this.rocketConfig = result.rocketConfig;
    this.padBaseAngle = result.padBaseAngle;

    // Initialize physics simulation
    this.physicsSimulation = new PhysicsSimulation({
      world: this.gameState.world,
      rocketConfig: this.rocketConfig,
      rocketBody: this.rocketBody,
      gameState: this.gameState,
      effectsSystem: this.effectsSystem,
      soundSystem: this.soundSystem,
      padBaseAngle: this.padBaseAngle,
      aeroCdEff: this.aeroCdEff,
      aeroAreaEff: this.aeroAreaEff,
      lastMach: this.lastMach,
      lastAoADeg: this.lastAoADeg,
      debugLog: (...args) => this.debugLog(...args),
      getRocketBounds: () => this.rocketRenderer.getRocketBounds(this.gameState.rocket),
      destroyRocket: (reason) => this.destroyRocket(reason),
    });

    // Initialize command executor
    this.commandExecutor = new CommandExecutor({
      gameState: this.gameState,
      rocketBody: this.rocketBody,
      rocketConfig: this.rocketConfig,
      soundSystem: this.soundSystem,
      effectsSystem: this.effectsSystem,
      stageManager: this.stageManager,
      rocketRenderer: this.rocketRenderer,
      debugLog: (...args) => this.debugLog(...args),
      destroyRocket: (reason) => this.destroyRocket(reason),
    });
  }

  /**
   * Setup event listeners for input
   */
  private setupEventListeners(): void {
    new InputController(this, this.canvas, this.camera, this.hudSystem, this.gameState).init();
  }

  /**
   * Handle key down events
   * @param event Keyboard event
   */

  /**
   * Initialize the game engine
   */
  async initialize(): Promise<void> {
    this.debugLog('Game engine initialized');
  }

  /**
   * Start the game loop
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.gameState.isRunning = true;
    this.lastTime = performance.now();
    // Play game start sound
    this.soundSystem.playGameStart();
    this.gameLoop();
    this.debugLog('Game started');
  }

  /**
   * Increment/decrement throttle by delta (clamped 0..1)
   */
  nudgeThrottle(delta: number): void {
    this.commandExecutor.nudgeThrottle(delta);
  }

  // Helpers for input controller
  setTurnLeft(state: boolean): void {
    this.turnLeft = state;
  }
  setTurnRight(state: boolean): void {
    this.turnRight = state;
  }
  isAutopilotRunning(): boolean {
    return !!this.autopilot?.isRunning();
  }
  handleResize(): void {
    this.renderer.handleResize();
  }

  /**
   * Pause the game
   */
  pause(): void {
    this.gameState.isPaused = true;
    this.debugLog('Game paused');
  }

  /**
   * Stop the game and clean up resources
   */
  stop(): void {
    this.isRunning = false;
    this.gameState.isPaused = true;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }

  /**
   * Resume the game
   */
  resume(): void {
    this.gameState.isPaused = false;
    this.debugLog('Game resumed');
  }

  /**
   * Restart the game
   */
  restart(): void {
    this.debugLog('🔄 Restarting game...');
    this.stop();

    // Reset states
    this.stateManager.resetState();
    this.overspeedTime = 0;

    // Clear all effects
    this.stageManager.reset();
    this.effectsSystem.reset();
    this.atmosphereUI.reset();

    // Reinitialize game state
    this.initializeGameState();
    // Apply pending autopilot mode if requested
    if (this.pendingAutopilotMode !== null) {
      this.autopilotEnabled = this.pendingAutopilotMode;
      this.gameState.autopilotEnabled = this.pendingAutopilotMode;
      document.dispatchEvent(
        new CustomEvent('autopilot-toggle', { detail: { enabled: this.autopilotEnabled } })
      );
      this.pendingAutopilotMode = null;
    }
    this.gameStartTime = Date.now();
    this.missionTimer = 0;

    // Start the game
    this.start();
    this.debugLog('✅ Game restarted successfully!');
  }

  // Reload the page like F5 and optionally persist autopilot mode for next launch
  goToMenu(autopilot?: boolean): void {
    try {
      if (typeof autopilot === 'boolean') {
        localStorage.setItem('startAutoPilot', autopilot ? '1' : '0');
      }
    } catch {}
    window.location.reload();
  }

  /**
   * Toggle pause state
   */
  togglePause(): void {
    if (this.gameState.isPaused) {
      this.resume();
    } else {
      this.pause();
    }
  }

  /**
   * Reset the game to initial state
   */
  reset(): void {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.initializeGameState();
    this.debugLog('Game reset');
  }

  /**
   * Main game loop
   */
  private gameLoop(): void {
    if (!this.isRunning) return;

    const currentTime = performance.now();
    const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1); // Cap at 100ms
    this.lastTime = currentTime;

    if (!this.gameState.isPaused) {
      this.update(deltaTime * this.gameState.timeWarp * this.gameSpeed);
    }

    this.render();

    this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
  }

  /**
   * Update game logic
   * @param deltaTime Frame time in seconds
   */
  private update(deltaTime: number): void {
    // Handle explosion phase using stateManager
    if (this.stateManager.isExplosionPhase()) {
      const stillExploding = this.stateManager.updateExplosion(deltaTime);

      // Update visuals during explosion phase
      this.effectsSystem.update(deltaTime);
      this.stageManager.update(deltaTime, this.gameState.world, this.renderer, (pos, vel) =>
        this.effectsSystem.createExplosion(pos, vel)
      );

      if (!stillExploding) {
        // Explosion ended, now in game over state
      }
      return;
    }

    // Check if game is over using stateManager
    if (this.stateManager.isGameOverState()) {
      const result = this.stateManager.updateGameOver(deltaTime);

      if (result.shouldRestart) {
        this.goToMenu(this.autopilotEnabled);
      }

      // Keep visuals alive while game over screen shows
      this.effectsSystem.update(deltaTime);
      this.stageManager.update(deltaTime, this.gameState.world, this.renderer, (pos, vel) =>
        this.effectsSystem.createExplosion(pos, vel)
      );
      return;
    }

    // Advance simulated clocks by the simulated delta time (respects speed/warp)
    this.gameState.currentTime += deltaTime;
    this.missionTimer += deltaTime;

    // Update attitude before physics so thrust aligns with rotation
    {
      const g = updateGuidance(
        {
          turnLeft: this.turnLeft,
          turnRight: this.turnRight,
          apHold: this.apHold,
          apTargetRot: this.apTargetRot,
          angularVelocity: this.angularVelocity,
          angularAccel: this.angularAccel,
          maxTurnRate: this.maxTurnRate,
          debugEnabled: this.debugEnabled,
          lastDebugLogTime: this.lastDebugLogTime,
          currentTime: this.gameState.currentTime,
          rotation: this.rocketBody.rotation,
          velocity: this.rocketBody.velocity,
          position: this.rocketBody.position,
          getAltitude: (r: number) => this.gameState.world.getAltitude(r),
        },
        deltaTime
      );
      this.rocketBody.rotation = g.rotation;
      this.angularVelocity = g.angularVelocity;
      this.apTargetRot = g.apTargetRot;
      this.lastDebugLogTime = g.lastDebugLogTime;
      if (g.debugMessages?.length) {
        for (const m of g.debugMessages) this.debugLog(m);
      }
    }

    // Update physics
    this.physicsIntegrator.update(deltaTime, (dt) => {
      this.updatePhysics(dt);
    });
    // Script engine tick (runs only when a queue exists)
    this.autopilot?.update(deltaTime);

    // Update background system
    this.background.update(this.gameState, deltaTime);

    // Update staging animation
    this.stageManager.update(deltaTime, this.gameState.world, this.renderer, (pos, vel) =>
      this.effectsSystem.createExplosion(pos, vel)
    );

    // Update effects system
    this.effectsSystem.update(deltaTime);

    // Atmosphere UI messages
    this.atmosphereUI.checkLayers(
      this.gameState.world,
      this.gameState.rocket.position.magnitude(),
      this.gameState.currentTime
    );
    this.atmosphereUI.update(this.gameState.currentTime);

    // Update speed effects
    const rotation = this.gameState.rocket.rotation;
    const rocketDown = new Vector2(Math.sin(rotation), -Math.cos(rotation));
    const exhaustLocalY = this.gameState.rocket.exhaustY;
    let bottomDistance: number;
    if (typeof exhaustLocalY === 'number') {
      bottomDistance = Math.max(10, -exhaustLocalY);
    } else {
      const dims = this.rocketRenderer.getRocketBounds(this.gameState.rocket);
      bottomDistance = Math.max(10, dims.height / 2);
    }

    this.effectsSystem.updateSpeedEffects(
      deltaTime,
      this.gameState,
      this.gameState.world,
      rocketDown,
      bottomDistance
    );

    // Create engine smoke effects
    const engineBase = this.gameState.rocket.position.add(rocketDown.multiply(bottomDistance));
    this.effectsSystem.createEngineSmoke(
      this.gameState,
      this.gameState.world,
      rocketDown,
      engineBase
    );

    // Apply atmospheric speed cap and heating
    this.enforceAtmosphericLimits(deltaTime);

    // Update engine sound environment (muffle in space)
    const altForSound = this.gameState.world.getAltitude(
      this.gameState.rocket.position.magnitude()
    );
    const dens = this.gameState.world.getAtmosphericDensity(Math.max(0, altForSound));
    const densNorm = Math.max(0, Math.min(1, dens / this.gameState.world.surfaceDensity));

    // Update rocket state from physics
    this.updateRocketState();
    // Smooth visual rotation toward physics rotation to avoid snaps
    this.visualRotation = updateVisualGuidance(
      this.visualRotation,
      this.rocketBody.rotation,
      deltaTime
    );

    // Update camera - instant follow, no smooth animation
    this.camera.position = this.gameState.rocket.position.clone();

    // Only auto-adjust zoom if user hasn't manually controlled it and not in orbit yet
    const altitude = this.gameState.world.getAltitude(this.gameState.rocket.position.magnitude());
    const isInOrbit = altitude > 200_000; // Consider orbit at 200km+

    if (!this.gameState.manualZoomControl && !isInOrbit) {
      // Keep current zoom for surface operations - no auto zoom out
      // This maintains the detailed view until orbit is achieved
      if (altitude < 50_000) {
        // Keep good zoom level until well into atmosphere
        const targetZoom = 0.75; // Maintain closer, detailed view near surface
        this.camera.setZoom(targetZoom);
      }
    }

    // Update facts system
    this.factSystem?.update(
      Date.now(),
      this.gameState.world.getAltitude(this.gameState.rocket.position.magnitude())
    );

    // Big success cues (audio)
    this.checkSuccessSounds();
  }

  /**
   * Smoothly update rocket attitude based on input (slow turn)
   */
  // guidance logic moved to GuidanceSystem.ts

  // small API for Autopilot to control the ship
  setAutopilotHold(mode: 'none' | 'prograde' | 'retrograde' | 'up'): void {
    this.apHold = mode;
  }
  setAutopilotTargetAngle(deg: number): void {
    // Positive degrees rotate left; east is to the right, so negative degrees for east.
    const rad = (deg * Math.PI) / 180;
    this.apTargetRot = rad;
    this.apHold = 'target';
  }
  isEngineOn(): boolean {
    return this.gameState.rocket.isEngineIgnited;
  }
  // Public helper: detect if rocket is on pad/ground (for UI gating)
  isOnGround(): boolean {
    try {
      const dims = this.rocketRenderer.getRocketBounds(this.gameState.rocket);
      const halfHeight = dims.height / 2;
      const nozzleDrop = 6;
      const r = this.rocketBody.position.magnitude();
      const bottomAlt = r - (this.gameState.world.planetRadius + halfHeight + nozzleDrop);
      if (bottomAlt <= 1.5) return true;
    } catch {}
    return (
      this.gameState.rocket.isClamped === true ||
      this.gameState.rocket.isOnGround === true ||
      this.gameState.rocket.hasEverLaunched === false
    );
  }
  getCurrentTWR(): number {
    const g = this.gameState.world.getGravitationalAcceleration(
      this.rocketBody.position.magnitude()
    );
    const thrust = this.rocketConfig.getCurrentThrust() * this.gameState.rocket.throttle;
    const w = this.rocketBody.mass * g;
    return w > 0 ? thrust / w : 0;
  }

  // Small helpers for the external console UI
  setAutopilotLogger(fn: (msg: string) => void): void {
    // simple log forwarder used by the console UI
    this.apLogger = fn;
    this.autopilot?.setLogger((m) => {
      if (this.apLogger) this.apLogger(m);
    });
  }
  runAutopilotScript(text: string): void {
    if (!this.autopilot) return;
    this.autopilot.runScript(text);
  }
  runAutopilotCommand(cmd: string): void {
    if (!this.autopilot) return;
    this.autopilot.runCommand(cmd);
  }
  stopAutopilot(): void {
    this.autopilot?.stop();
  }

  /** Set game speed. Display values: 1x (actually 2x), 2x (actually 4x), 10x, 50x */
  setGameSpeed(displaySpeed: number): void {
    const speedMap: { [key: number]: number } = {
      1: 2, // Display 1x, actually 2x
      3: 4, // Display 2x (was 3x), actually 4x
      10: 10, // Display 10x, actually 10x
      50: 50, // Display 50x, actually 50x
    };
    const actualSpeed = speedMap[displaySpeed] || 2;
    this.gameSpeed = actualSpeed;
    try {
      document.dispatchEvent(
        new CustomEvent('game-speed-change', { detail: { speed: displaySpeed } })
      );
    } catch {}
  }

  /**
   * Clamp rocket speed in atmosphere to a density-based limit and apply heating if exceeded
   */
  private enforceAtmosphericLimits(deltaTime: number): void {
    const res = enforceAtmosphericLimits(
      {
        world: this.gameState.world,
        position: this.rocketBody.position,
        velocity: this.rocketBody.velocity,
        mass: this.rocketBody.mass,
        aeroCdEff: this.aeroCdEff,
        aeroAreaEff: this.aeroAreaEff,
        heatLevel: this.effectsSystem.getHeatLevel(),
        atmosphericGlow: this.effectsSystem.getAtmosphericGlow(),
        hasBurnedUp: this.effectsSystem.hasBurnedUpStatus(),
        isGameOver: this.stateManager.isGameOverState(),
        currentTime: this.gameState.currentTime,
        overspeedTime: this.overspeedTime,
      },
      deltaTime
    );
    this.rocketBody.velocity = res.velocity;
    this.gameState.rocket.velocity = res.velocity.clone();
    this.effectsSystem.setHeatLevel(res.heatLevel);
    this.effectsSystem.setAtmosphericGlow(res.atmosphericGlow);
    this.effectsSystem.setHasBurnedUp(res.hasBurnedUp);
    this.overspeedTime = res.overspeedTime || 0;
    if (res.explode) {
      this.effectsSystem.createExplosion(
        this.gameState.rocket.position,
        this.gameState.rocket.velocity
      );
      this.soundSystem.playExplosion();
    }
    if (res.destroy) {
      this.destroyRocket(res.gameOverReason || 'Vehicle destroyed');
    }
  }

  /**
   * Update physics simulation
   * @param deltaTime Physics timestep
   */
  private updatePhysics(deltaTime: number): void {
    // Update context for physics simulation
    this.physicsSimulation.updateContext({
      gameState: this.gameState,
      rocketBody: this.rocketBody,
      rocketConfig: this.rocketConfig,
      padBaseAngle: this.padBaseAngle,
    });

    // Run physics simulation
    const result = this.physicsSimulation.updatePhysics(deltaTime);

    // Update aerodynamic values
    this.aeroCdEff = result.aeroCdEff;
    this.aeroAreaEff = result.aeroAreaEff;
    this.lastMach = result.lastMach;
    this.lastAoADeg = result.lastAoADeg;
  }

  /**
   * Update rocket state from physics body
   */
  private updateRocketState(): void {
    this.stateManager.updateRocketState(
      this.gameState,
      this.rocketBody,
      this.rocketConfig,
      this.visualRotation,
      this.isAutopilotRunning(),
      this.aeroCdEff,
      this.aeroAreaEff
    );
  }

  /**
   * Render the game
   */
  private render(): void {
    // Orient camera so planet "down" points to screen bottom: align local radial outward with screen up.
    try {
      const ang = Math.atan2(this.gameState.rocket.position.y, this.gameState.rocket.position.x);
      // Align local radial outward with screen up (renderer uses -rotation)
      this.camera.setRotation(ang - Math.PI / 2);
    } catch {}
    this.renderer.clear();
    this.renderer.beginFrame();

    // Draw planet surface using PlanetRenderer
    this.planetRenderer.render(
      this.renderer,
      this.gameState.world,
      this.gameState.currentTime,
      this.gameState.rocket.position,
      this.padBaseAngle
    );

    // Draw background elements via BackgroundSystem (behind rocket/effects)
    this.background.render(this.renderer, this.gameState);

    // Draw effects behind rocket (smoke, streaks)
    this.effectsSystem.render(this.renderer, this.gameState.rocket);

    // Draw staging elements and debris
    this.stageManager.render(this.renderer);

    // Draw rocket (only if not exploding or game over)
    if (!this.stateManager.isExplosionPhase() && !this.stateManager.isGameOverState()) {
      this.rocketRenderer.render(this.renderer, this.gameState.rocket);
    }

    // Draw effects in front of rocket (explosions, debris)
    this.effectsSystem.renderFront(this.renderer);

    // Far-out locator: blink a small red dot at rocket position when zoomed out
    if (this.camera.zoom < 0.01) {
      const t = this.gameState.currentTime;
      const pulse = 0.5 + 0.5 * Math.sin(2 * Math.PI * 1.2 * t);
      const alpha = 0.25 + 0.45 * pulse;
      const pxRadius = 3;
      const worldR = pxRadius / Math.max(1e-6, this.camera.zoom);
      const color = `rgba(255, 40, 40, ${alpha.toFixed(3)})`;
      this.renderer.drawCircle(this.gameState.rocket.position, worldR, color);
    }

    this.renderer.endFrame();

    // Draw HUD
    if (this.showHUD) {
      this.hudSystem.render(this.renderer, this.gameState, this.missionTimer);
      // Draw facts overlay
      this.factSystem?.render();
      // Draw atmosphere messages on top of HUD
      this.atmosphereUI.render(this.gameState.currentTime);
    }

    // Draw game over screen if needed
    if (this.stateManager.isGameOverState()) {
      this.renderGameOverScreen();
    }
  }

  // Command API methods
  igniteEngines(): boolean {
    return this.commandExecutor.igniteEngines();
  }

  setThrottle(value: number): void {
    this.commandExecutor.setThrottle(value);
  }

  cutEngines(): void {
    this.commandExecutor.cutEngines();
  }

  performStaging(): boolean {
    return this.commandExecutor.performStaging();
  }

  /**
   * Destroy rocket completely - triggers explosion phase first
   */
  private destroyRocket(reason?: string): void {
    // Start explosion in stateManager
    this.stateManager.startExplosion(reason || 'Vehicle destroyed');

    // Cut engines and stop physics
    this.gameState.rocket.isEngineIgnited = false;
    this.gameState.rocket.throttle = 0;
    this.soundSystem.stopEngine();

    // Create debris particles from rocket destruction
    this.effectsSystem.createDestructionDebris(
      this.gameState.rocket.position,
      this.gameState.rocket.velocity
    );
  }

  /**
   * Render game over screen
   */
  private renderGameOverScreen(): void {
    // Use stateManager's implementation
    this.stateManager.renderGameOverScreen();
  }

  /**
   * Get menu button bounds for click detection
   */
  getMenuButtonBounds(): { x: number; y: number; width: number; height: number } | undefined {
    return this.stateManager.menuButtonBounds;
  }
}

import { Vector2 } from '../physics/Vector2.js';
import { RigidBody } from '../physics/RigidBody.js';
import { WorldParameters } from '../physics/WorldParameters.js';
import { AtmosphericPhysics } from '../physics/AtmosphericPhysics.js';
import { PhysicsIntegrator } from '../physics/PhysicsIntegrator.js';
import { OrbitalMechanics } from '../physics/OrbitalMechanics.js';
import { SfxPlayer } from './SfxPlayer.js';
import { CanvasRenderer, Camera } from '../rendering/CanvasRenderer.js';
import { RocketRenderer } from '../rendering/RocketRenderer.js';
import { HUDSystem } from '../ui/HUDSystem.js';
import { RocketConfiguration } from './RocketConfiguration.js';
import spaceFacts from '../data/space_facts.json';
import type { GameState } from './types.js';
import { SoundSystem } from './SoundSystem.js';
import { SoundPaths, getEngineBaseGainForStage } from './AudioConfig.js';
import { isSoundEnabled } from './Settings.js';
import { Autopilot } from './Autopilot.js';

// Main game engine class
export class GameEngine {
  private canvas: HTMLCanvasElement;
  private renderer: CanvasRenderer;
  private camera: Camera;
  private hudSystem: HUDSystem;
  private rocketRenderer: RocketRenderer;
  private physicsIntegrator: PhysicsIntegrator;
  private sound: SoundSystem | null = null;
  private sfx: { explosion: SfxPlayer; success: SfxPlayer; start: SfxPlayer } | null = null;
  private successSpacePlayed = false;
  private successOrbitPlayed = false;

  private gameState!: GameState;
  private rocketBody!: RigidBody;
  private rocketConfig!: RocketConfiguration;

  private isRunning: boolean = false;
  private lastTime: number = 0;
  private animationFrameId: number = 0;
  
  // Background elements
  private clouds: Array<{pos: Vector2, size: number, opacity: number}> = [];
  private birds: Array<{pos: Vector2, vel: Vector2, wingPhase: number}> = [];
  private planes: Array<{pos: Vector2, vel: Vector2, type: 'airliner' | 'fighter'}> = [];
  private lastCloudSpawn = 0;
  private lastBirdSpawn = 0;
  private lastPlaneSpawn = 0;
  
  // Staging animation
  private stagingDebris: Array<{pos: Vector2, vel: Vector2, rotation: number, rotSpeed: number, life: number}> = [];
  private separatedStages: Array<{pos: Vector2, vel: Vector2, rotation: number, rotSpeed: number, life: number, stageIndex: number, bornTime: number, age: number, landed?: boolean}> = [];
  private smokeParticles: Array<{pos: Vector2, vel: Vector2, life: number, maxLife: number, size: number}> = [];
  private explosions: Array<{pos: Vector2, vel: Vector2, life: number, maxLife: number, size: number, particles: Array<{pos: Vector2, vel: Vector2, color: string, size: number}>}> = [];
  private stagingAnimationTime = 0;
  private lastStagingTime = 0;
  
  // Space facts system
  private factBubbles: Array<{text: string, pos: Vector2, vel: Vector2, bornAtMs: number, ttlSec: number, opacity: number}> = [];
  private lastFactSpawnWallMs = 0;
  private nextFactInterval = 40; // seconds
  private shownFacts: Set<number> = new Set();
  
  // Atmosphere notifications
  private atmosphereMessages: Array<{text: string, time: number, duration: number}> = [];
  private lastAtmosphereLayer = 0; // Start in troposphere to avoid initial message
  private gameStartTime = 0;
  private missionTimer = 0;
  
  // Game over system
  private isGameOver = false;
  private gameOverTimer = 0;
  private explosionPhase = false; // Show explosion before game over screen
  private explosionTimer = 0;
  private gameOverReason = '';
  
  // Game speed controls
  private gameSpeed = 1; // 1x, 2x, 3x speed multiplier

  // HUD visibility (debug helper). Handy to isolate rendering issues.
  private showHUD = true;
  
  /**
   * Safe Vector2 normalize utility using Vector2.normalized()
   */
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
  
  // Speed effects
  private velocityStreaks: Array<{pos: Vector2, vel: Vector2, life: number, intensity: number}> = [];
  private atmosphericGlow = 0; // Heating effect intensity
  private heatLevel = 0; // 0-100 heat accumulation
  private hasBurnedUp = false;
  private padBaseAngle: number = Math.PI / 2; // base ground angle for pad/site
  private autopilot?: Autopilot;
  private autopilotEnabled: boolean = false;
  private pendingAutopilotMode: boolean | null = null;
  private firstIgnitionPlayed: boolean = false;
  private apHold: 'none'|'prograde'|'retrograde'|'up'|'target' = 'none';
  private apTargetRot: number | null = null;
  private apLogger: ((msg: string)=>void) | null = null; // small log hook for console

  // Aerodynamics (effective values for HUD/limits)
  // Computed each frame from attitude and Mach to reflect current airflow.
  private aeroCdEff: number = 0.3;
  private aeroAreaEff: number = 10;
  private lastMach: number = 0;
  private lastAoADeg: number = 0;

  // Attitude control (slow turning)
  private turnLeft: boolean = false;
  private turnRight: boolean = false;
  private angularVelocity: number = 0; // rad/s
  private readonly maxTurnRate: number = 0.12; // rad/s (~6.9°/s)
  private readonly angularAccel: number = 0.5; // rad/s^2
  private visualRotation: number = 0; // smoothed rotation for rendering
  // Debug controls
  private debugEnabled: boolean = false;
  private lastDebugLogTime: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new CanvasRenderer(canvas);
    // Initialize camera - will be set properly in initializeGameState
    this.camera = new Camera(Vector2.zero(), 0.1);
    this.hudSystem = new HUDSystem(canvas);
    this.rocketRenderer = new RocketRenderer();
    this.physicsIntegrator = new PhysicsIntegrator();
    this.autopilot = new Autopilot(this);

    this.renderer.setCamera(this.camera);

    // Initialize game state first
    this.initializeGameState();
    
    // Engine sound: start clip + loop clip
    this.sound = new SoundSystem(SoundPaths.engineStart, SoundPaths.engineLoop);
    this.sound.setMuted(!isSoundEnabled());
    // One-shot SFX (put files under public/sounds)
    this.sfx = {
      explosion: new SfxPlayer(),
      success: new SfxPlayer(),
      start: new SfxPlayer(),
    };
    
    // Load shown facts from localStorage and schedule first fact
    this.loadShownFacts();
    this.nextFactInterval = 30 + Math.random() * 30;
    
    // Setup camera to proper initial position and zoom
    this.camera.setTarget(this.gameState.rocket.position);
    this.camera.position = this.gameState.rocket.position.clone();
    this.camera.setZoom(0.8); // Start more zoomed in for detailed rocket view
    
    // Initialize timer and show welcome message
    this.gameStartTime = Date.now();
    this.missionTimer = 0;
    this.atmosphereMessages.push({
      text: 'Good luck!',
      time: 0,
      duration: 3.0
    });
    
    // Setup event listeners
    this.setupEventListeners();
    // Single mode (manual) — scripts can run any time
    this.gameState.autopilotEnabled = false;
  }

  toggleAutopilot(): void {
    this.autopilotEnabled = !this.autopilotEnabled;
    this.gameState.autopilotEnabled = this.autopilotEnabled;
    // Notify UI outside canvas to show/hide the console
    document.dispatchEvent(new CustomEvent('autopilot-toggle', { detail: { enabled: this.autopilotEnabled } }));
  }

  isAutopilotOn(): boolean {
    return this.autopilotEnabled;
  }

  /** Get apoapsis altitude estimate (m) from HUD cache to stay consistent. */
  getApoapsisAltitude(): number {
    const info = (this.hudSystem as any).getLastProjectedInfo?.();
    if (info && typeof info.apoAlt === 'number') return info.apoAlt;
    return 0;
  }

  /** Get periapsis altitude estimate (m) from HUD cache for consistency. */
  getPeriapsisAltitude(): number {
    const info = (this.hudSystem as any).getLastProjectedInfo?.();
    if (info && typeof info.periAlt === 'number') return info.periAlt;
    return 0;
  }

  /** Radial velocity (m/s): positive when moving away from planet center. */
  getRadialVelocity(): number {
    const p = this.gameState.rocket.position;
    const v = this.gameState.rocket.velocity;
    const r = Math.hypot(p.x, p.y);
    if (r < 1e-6) return 0;
    const ux = p.x / r, uy = p.y / r;
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
    const world = this.gameState.world;
    const pos = this.gameState.rocket.position;
    const vel = this.gameState.rocket.velocity;
    const alt = world.getAltitude(pos.magnitude());

    // Reached space (Kármán line ~100 km)
    if (!this.successSpacePlayed && alt >= 100_000) {
      this.successSpacePlayed = true;
      this.sfx?.success.play(SoundPaths.success, 0.7).catch(()=>{});
    }

    // Stable orbit: closed ellipse with perigee above 80 km
    if (!this.successOrbitPlayed) {
      const mu = world.gravitationalParameter as any as number;
      const rp = (() => {
        const r0 = pos.magnitude();
        const v2 = vel.x * vel.x + vel.y * vel.y;
        const rv = pos.x * vel.x + pos.y * vel.y;
        const eX = (1 / mu) * ((v2 - mu / r0) * pos.x - rv * vel.x);
        const eY = (1 / mu) * ((v2 - mu / r0) * pos.y - rv * vel.y);
        const e = Math.hypot(eX, eY);
        const h = Math.abs(pos.x * vel.y - pos.y * vel.x);
        const rpLocal = h * h / (mu * (1 + e));
        return rpLocal;
      })();
      const periAlt = rp - world.planetRadius;
      if (isFinite(periAlt) && periAlt > 80_000) {
        this.successOrbitPlayed = true;
        this.sfx?.success.play(SoundPaths.success, 0.9).catch(()=>{});
      }
    }
  }

  /**
   * Initialize the game state with default values
   */
  private initializeGameState(): void {
    this.rocketConfig = RocketConfiguration.createTutorialRocket();

    // Create world first
    const world = new WorldParameters();
    
    // Start rocket on launch pad - bottom at pad
    const launchPosition = new Vector2(0, world.planetRadius + 0); // on surface
    const launchVelocity = Vector2.zero();

    this.rocketBody = new RigidBody(
      launchPosition,
      launchVelocity,
      this.rocketConfig.getCurrentMass()
    );
    
    // Set rocket rotation to point up (0 = up for physics)
    this.rocketBody.rotation = 0;

    this.gameState = {
      isRunning: false,
      isPaused: false,
      timeWarp: 1.0,
      currentTime: 0,
      world: world,
      rocket: {
        position: launchPosition.clone(),
        velocity: launchVelocity.clone(),
        rotation: 0, // Point up (0 = up for physics)
        mass: this.rocketConfig.getCurrentMass(),
        fuel: this.rocketConfig.stages.reduce((sum, stage) => sum + stage.fuelRemaining, 0),
        throttle: 0,
        isEngineIgnited: false,
        hasEverLaunched: false,
        isClamped: true,
        isOnGround: true,
        currentStage: 0,
        stages: this.rocketConfig.stages,
      },
      autopilotEnabled: true,
    };

    // Adjust initial position so the visual bottom sits on the pad despite centered rendering
    const dims = this.rocketRenderer.getRocketBounds(this.gameState.rocket as any);
    const halfHeight = dims.height / 2;
    const nozzleDrop = 6; // stage1 nozzle visual offset
    const padClearance = 0; // no clearance; sit on surface
    this.rocketBody.position = launchPosition.add(new Vector2(0, halfHeight + nozzleDrop + padClearance));
    this.gameState.rocket.position = this.rocketBody.position.clone();
    // Base angle for pad so buildings and rocket align on restart
    this.padBaseAngle = Math.atan2(this.rocketBody.position.y, this.rocketBody.position.x);
  }

  /**
   * Setup event listeners for input
   */
  private setupEventListeners(): void {
    // Keyboard controls
    document.addEventListener('keydown', (event) => {
      this.handleKeyDown(event);
    });

    document.addEventListener('keyup', (event) => {
      this.handleKeyUp(event);
    });

    // Window resize
    window.addEventListener('resize', () => {
      this.renderer.handleResize();
      this.hudSystem.handleResize();
    });

    // Mouse wheel zoom control - disable auto zoom when manually controlling
    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1; // Zoom out/in
      const currentZoom = this.camera.zoom;
      const newZoom = Math.max(0.01, Math.min(2.0, currentZoom * zoomFactor)); // Clamp zoom
      this.camera.setZoom(newZoom);
      
      // Disable automatic zoom when user manually controls zoom
      this.gameState.manualZoomControl = true;
    });

    // Mouse click handler for UI elements
    this.canvas.addEventListener('click', (event) => {
      this.handleCanvasClick(event);
    });

    // HTML speed button event listeners
    this.setupSpeedControls();
  }

  /**
   * Handle key down events
   * @param event Keyboard event
   */
  private handleKeyDown(event: KeyboardEvent): void {
    // When a script is running, ignore keyboard controls (except HUD toggle and Menu)
    if (this.autopilot?.isRunning()) {
      if (event.code === 'KeyR') { this.goToMenu(false); return; }
      if (event.code === 'KeyH') { this.showHUD = !this.showHUD; return; }
      return;
    }
    switch (event.code) {
      case 'Space':
        event.preventDefault();
        if (!this.gameState.rocket.isEngineIgnited) {
          this.igniteEngines();
        }
        break;
      case 'KeyL': // Toggle debug overlay/logs
        this.debugEnabled = !this.debugEnabled;
        console.log(`🔎 Debug ${this.debugEnabled ? 'ENABLED' : 'DISABLED'}`);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.nudgeThrottle(+0.1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.nudgeThrottle(-0.1);
        break;
      case 'KeyT':
        this.setThrottle(1.0); // Full throttle
        break;
      case 'KeyG':
        this.setThrottle(0.0); // Zero throttle
        break;
      case 'KeyB':
        this.cutEngines(); // Cut engines
        break;
      case 'ArrowLeft':
        this.turnLeft = true;
        if (this.debugEnabled) console.log('⬅️ TurnLeft: ON');
        break;
      case 'ArrowRight':
        this.turnRight = true;
        if (this.debugEnabled) console.log('➡️ TurnRight: ON');
        break;
      case 'KeyS':
        this.performStaging();
        break;
      case 'KeyP':
        this.togglePause();
        break;
      case 'KeyR':
        this.goToMenu(false);
        break;
      case 'KeyH':
        // Toggle HUD on/off (debug). Helps check if an overlay artifact comes from HUD.
        this.showHUD = !this.showHUD;
        console.log(`HUD ${this.showHUD ? 'ON' : 'OFF'}`);
        break;
      // Auto-release clamps on ignite; no manual key needed
      // 'L' key no longer used
      // case 'KeyL':
      //   break;
    }
  }

  /**
   * Handle key up events
   * @param _event Keyboard event
   */
  private handleKeyUp(_event: KeyboardEvent): void {
    if (this.autopilotEnabled) return;
    const event = _event;
    switch (event.code) {
      case 'ArrowLeft':
        this.turnLeft = false;
        if (this.debugEnabled) console.log('⬅️ TurnLeft: OFF');
        break;
      case 'ArrowRight':
        this.turnRight = false;
        if (this.debugEnabled) console.log('➡️ TurnRight: OFF');
        break;
    }
  }

  /**
   * Handle mouse clicks on canvas for UI interactions
   */
  private handleCanvasClick(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // Convert to canvas device pixels because HUD bounds are in device pixels
    const x = (event.clientX - rect.left) * dpr;
    const y = (event.clientY - rect.top) * dpr;

    // Check for restart button click (stored in HUDSystem)
    const hudSystem = this.hudSystem as any;
    if (hudSystem.restartButtonBounds) {
      const button = hudSystem.restartButtonBounds;
      if (x >= button.x && x <= button.x + button.width && 
          y >= button.y && y <= button.y + button.height) {
        this.goToMenu(this.autopilotEnabled);
        return;
      }
    }

    // Check for autopilot prefill button
    if ((hudSystem as any).autopilotButtonBounds) {
      const b = (hudSystem as any).autopilotButtonBounds;
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
        // Prefill the console with an ascent script to ~100km orbit
        document.dispatchEvent(new CustomEvent('prefill-autopilot-script'));
        return;
      }
    }
  }

  /**
   * Setup HTML speed control buttons
   */
  private setupSpeedControls(): void {
    const speedButtons = document.querySelectorAll('.speed-btn');
    speedButtons.forEach(button => {
      button.addEventListener('click', (event) => {
        const target = event.target as HTMLButtonElement;
        const speed = parseInt(target.dataset.speed || '1');
        
        // Altitude gating for higher speeds
        const altitude = this.gameState.world.getAltitude(this.gameState.rocket.position.magnitude());
        let minAlt = 0;
        if (speed >= 3 && speed < 10) minAlt = 500;     // 3x above 500 m
        if (speed >= 10 && speed < 50) minAlt = 1_000;  // 10x above 1 km
        if (speed >= 50) minAlt = 30_000;               // 50x above 30 km
        if (altitude < minAlt) {
          // Inform player
          this.atmosphereMessages.push({
            text: `${speed}x > ${minAlt/1000 >= 1 ? (minAlt/1000)+' km' : minAlt+' m'}`,
            time: this.gameState.currentTime,
            duration: 2.5
          });
          return;
        }

        // Update game speed
        this.gameSpeed = speed;
        
        // Update button visual state
        speedButtons.forEach(btn => btn.classList.remove('active'));
        target.classList.add('active');
      });
    });
  }

  /**
   * Initialize the game engine
   */
  async initialize(): Promise<void> {
    console.log('Game engine initialized');
  }

  /**
   * Start the game loop
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.gameState.isRunning = true;
    this.lastTime = performance.now();
    // Game start sound (short UI cue)
    this.sfx?.start.play(SoundPaths.start, 0.7).catch(()=>{});
    this.gameLoop();

    console.log('Game started');
  }

  /**
   * Increment/decrement throttle by delta (clamped 0..1)
   */
  private nudgeThrottle(delta: number): void {
    const t = Math.max(0, Math.min(1, this.gameState.rocket.throttle + delta));
    this.setThrottle(t);
  }

  /**
   * Pause the game
   */
  pause(): void {
    this.gameState.isPaused = true;
    console.log('Game paused');
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
    console.log('Game resumed');
  }

  /**
   * Restart the game
   */
  restart(): void {
    console.log('🔄 Restarting game...');
    this.stop();
    this.sound?.stopEngine();
    
    // Reset game over and explosion states
    this.isGameOver = false;
    this.gameOverTimer = 0;
    this.explosionPhase = false;
    this.explosionTimer = 0;
    this.gameOverReason = '';
    
    // Clear all effects
    this.stagingDebris = [];
    this.separatedStages = [];
    this.smokeParticles = [];
    this.explosions = [];
    this.velocityStreaks = [];
    this.atmosphereMessages = [];
    this.clouds = [];
    this.birds = [];
    this.planes = [];
    
    // Reset atmosphere tracking
    this.lastAtmosphereLayer = 0;
    this.atmosphericGlow = 0;
    this.heatLevel = 0;
    this.hasBurnedUp = false;
    
    // Reinitialize game state
    this.initializeGameState();
    // Apply pending autopilot mode if requested
    if (this.pendingAutopilotMode !== null) {
      this.autopilotEnabled = this.pendingAutopilotMode;
      this.gameState.autopilotEnabled = this.pendingAutopilotMode;
      document.dispatchEvent(new CustomEvent('autopilot-toggle', { detail: { enabled: this.autopilotEnabled } }));
      this.pendingAutopilotMode = null;
    }
    this.gameStartTime = Date.now();
    this.missionTimer = 0;
    
    // Start the game
    this.start();
    
    console.log('✅ Game restarted successfully!');
  }

  private restartWithMode(autopilot: boolean): void {
    this.goToMenu(autopilot);
  }

  // Reload the page like F5 and optionally persist autopilot mode for next launch
  private goToMenu(autopilot?: boolean): void {
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
    console.log('Game reset');
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
    // Handle explosion phase (show explosion before game over screen)
    if (this.explosionPhase) {
      this.explosionTimer += deltaTime;
      // Show explosion for 2 seconds, then show game over screen
      if (this.explosionTimer >= 2.0) {
        this.explosionPhase = false;
        this.isGameOver = true;
        this.gameOverTimer = 0;
      }
      // Update explosions and particles during explosion phase
      this.updateExplosions(deltaTime);
      return;
    }
    
    // Check if game is over
    if (this.isGameOver) {
      this.gameOverTimer += deltaTime;
      if (this.gameOverTimer >= 5.0) {
        this.goToMenu(this.autopilotEnabled);
      }
      // Update explosions and particles even when game over
      this.updateExplosions(deltaTime);
      return;
    }
    
    // Advance simulated clocks by the simulated delta time (respects speed/warp)
    this.gameState.currentTime += deltaTime;
    this.missionTimer += deltaTime;

    // Update attitude before physics so thrust aligns with rotation
    this.updateAttitude(deltaTime);

    // Update physics
    this.physicsIntegrator.update(deltaTime, (dt) => {
      this.updatePhysics(dt);
    });
    // Script engine tick (runs only when a queue exists)
    this.autopilot?.update(deltaTime);

    // Auto-staging removed - user must manually stage

    // Update staging animation
    this.updateStagingAnimation(deltaTime);
    
    // Check for atmosphere layer changes
    this.checkAtmosphereLayers();
    
    // Update atmosphere messages
    this.updateAtmosphereMessages(deltaTime);
    
    // Update explosions
    this.updateExplosions(deltaTime);
    
    // Update speed effects
    this.updateSpeedEffects(deltaTime);

    // Apply atmospheric speed cap and heating
    this.enforceAtmosphericLimits(deltaTime);

    // Update engine sound environment (muffle in space)
    const altForSound = this.gameState.world.getAltitude(this.gameState.rocket.position.magnitude());
    const dens = this.gameState.world.getAtmosphericDensity(Math.max(0, altForSound));
    const densNorm = Math.max(0, Math.min(1, dens / this.gameState.world.surfaceDensity));
    this.sound?.setEnvironmentByDensity(densNorm);

    // Update rocket state from physics
    this.updateRocketState();
    // Smooth visual rotation toward physics rotation to avoid snaps
    this.updateVisualAttitude(deltaTime);

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
    
    // Facts update/spawn after camera updates so positioning is stable
    this.updateFactBubbles(deltaTime);
    this.maybeSpawnFact();

    // Big success cues (audio)
    this.checkSuccessSounds();
  }

  /**
   * Smoothly update rocket attitude based on input (slow turn)
   */
  private updateAttitude(deltaTime: number): void {
    // Left input produces positive rotation; right produces negative.
    let input = (this.turnLeft ? 1 : 0) - (this.turnRight ? 1 : 0);
    // Script/hold overrides manual input when a hold/target is set
    if (this.apHold !== 'none') {
      // Compute target
      if (this.apHold === 'up') {
        this.apTargetRot = 0;
      } else if (this.apHold === 'prograde' || this.apHold === 'retrograde') {
        const v = this.rocketBody.velocity;
        const speed = v.magnitude();
        // Prograde is the inertial velocity direction; gravity and thrust
        // naturally change this vector over time, so following it yields a
        // gravity turn.
        let velAngle = this.rocketBody.rotation;
        if (speed > 0.5) {
          // Angle measured from +Y (up), positive to the left. For (vx,vy): atan2(-vx, vy)
          velAngle = Math.atan2(-v.x, v.y);
        }
        // Blend toward prograde with altitude to avoid fighting near the pad.
        const alt = this.gameState.world.getAltitude(this.rocketBody.position.magnitude());
        const a0 = 2000;   // start blending (2 km)
        const a1 = 15000;  // fully trust prograde (15 km)
        const tRaw = (alt - a0) / Math.max(1, (a1 - a0));
        const t = Math.max(0, Math.min(1, tRaw));
        // Smoothstep for nicer response
        const s = t * t * (3 - 2 * t);
        const upAngle = 0; // straight up
        const targetPro = (this.apHold === 'prograde') ? velAngle : velAngle + Math.PI;
        // Shortest-arc blend between up and prograde angles
        let d = targetPro - upAngle;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        this.apTargetRot = upAngle + d * s;
      } else if (this.apHold === 'target') {
        // apTargetRot already set explicitly by a command
        // keep current target
      }
      // Determine shortest direction
      if (this.apTargetRot !== null) {
        let d = this.apTargetRot - this.rocketBody.rotation;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        input = d > 0.02 ? 1 : d < -0.02 ? -1 : 0; // deadzone
      }
    }

    // Integrate angular velocity with acceleration and clamp to max rate
    this.angularVelocity += input * this.angularAccel * deltaTime;
    const maxRate = this.maxTurnRate;
    if (this.angularVelocity > maxRate) this.angularVelocity = maxRate;
    if (this.angularVelocity < -maxRate) this.angularVelocity = -maxRate;

    // Apply rotation
    this.rocketBody.rotation += this.angularVelocity * deltaTime;

    // Allow full rotation (wrap handled in RigidBody to [-π, π])

    // Gentle damping when no input
    if (input === 0) {
      const damping = 0.98;
      this.angularVelocity *= damping;
      if (Math.abs(this.angularVelocity) < 1e-4) this.angularVelocity = 0;
    }

    // Debug logs (throttled)
    if (this.debugEnabled) {
      const now = this.gameState.currentTime;
      if (now - this.lastDebugLogTime > 0.1) {
        const deg = (this.rocketBody.rotation * 180 / Math.PI).toFixed(2);
        const avDeg = (this.angularVelocity * 180 / Math.PI).toFixed(2);
        console.log(`ATT dt=${deltaTime.toFixed(3)} in=${input} rot=${deg}° av=${avDeg}°/s`);
        this.lastDebugLogTime = now;
      }
    }
  }

  /**
   * Smooth visual rotation for rendering only
   */
  private updateVisualAttitude(deltaTime: number): void {
    // Light smoothing for render rotation so left/right feels smoother at 1x.
    // Interpolate along shortest arc.
    const a = this.visualRotation;
    let b = this.rocketBody.rotation;
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const k = 10; // smoothing speed (higher = snappier)
    const t = 1 - Math.exp(-k * Math.max(0, deltaTime));
    this.visualRotation = a + d * t;
  }

  // Public helpers for Autopilot
  setAutopilotHold(mode: 'none'|'prograde'|'retrograde'|'up'): void {
    this.apHold = mode;
  }
  setAutopilotTargetAngle(deg: number): void {
    // Positive degrees rotate left; east is to the right, so negative degrees for east.
    const rad = (deg * Math.PI) / 180;
    this.apTargetRot = rad;
    this.apHold = 'target';
  }
  isEngineOn(): boolean { return this.gameState.rocket.isEngineIgnited; }
  getCurrentTWR(): number {
    const g = this.gameState.world.getGravitationalAcceleration(this.rocketBody.position.magnitude());
    const thrust = this.rocketConfig.getCurrentThrust() * this.gameState.rocket.throttle;
    const w = this.rocketBody.mass * g;
    return w > 0 ? thrust / w : 0;
  }

  // Small helpers for the external console UI
  setAutopilotLogger(fn: (msg: string)=>void): void {
    // simple log forwarder used by the console UI
    this.apLogger = fn;
    this.autopilot?.setLogger((m)=>{ if (this.apLogger) this.apLogger(m); });
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

  /** Set game speed (1, 3, 10, 50). Updates UI buttons if present. */
  setGameSpeed(speed: number): void {
    const allowed = [1, 3, 10, 50];
    const s = allowed.includes(speed) ? speed : 1;
    this.gameSpeed = s;
    try {
      const btns = document.querySelectorAll('.speed-btn');
      btns.forEach((el) => {
        const b = el as HTMLButtonElement;
        const val = parseInt(b.dataset.speed || '1');
        if (val === s) b.classList.add('active'); else b.classList.remove('active');
      });
    } catch {}
  }

  /**
   * Clamp rocket speed in atmosphere to a density-based limit and apply heating if exceeded
   */
  private enforceAtmosphericLimits(deltaTime: number): void {
    const position = this.gameState.rocket.position;
    const velocity = this.gameState.rocket.velocity;
    const speed = velocity.magnitude();
    const altitude = this.gameState.world.getAltitude(position.magnitude());

    // Only apply within atmosphere (fake clamp off above ~80 km)
    if (altitude >= 80_000) {
      // Cool down gradually in space
      this.heatLevel = Math.max(0, this.heatLevel - 10 * deltaTime);
      return;
    }

    const density = this.gameState.world.getAtmosphericDensity(altitude);
    const gravity = this.gameState.world.getGravitationalAcceleration(position.magnitude());

    // Compute a reference terminal velocity and set a max allowed speed factor above it
    const mass = this.rocketBody.mass;
    // Use effective Cd·A matching our aero model
    const cd = this.aeroCdEff;
    const area = this.aeroAreaEff;
    // Terminal velocity is used as a soft reference, not a hard cap.
    const vTerm = AtmosphericPhysics.calculateTerminalVelocity(mass, density, cd, area, gravity);
    // Allow a buffer above terminal velocity for powered ascent/re-entry glides
    const vMax = (isFinite(vTerm) ? vTerm : 10_000) * 1.25 + 50; // reference speed, not a hard cap

    // If exceeding the reference limit, apply only a mild atmospheric damping (not a hard clamp)
    if (speed > vMax && speed > 0) {
      const overRatio = speed / Math.max(1, vMax);
      const densityNorm = Math.min(1, density / this.gameState.world.surfaceDensity);
      // Make damping very light and sub-linear in over-speed so high TWR can push through
      const over = Math.max(0, overRatio - 1);
      const decelRate = (1.5 + 8 * densityNorm) * Math.pow(over, 0.7); // m/s^2
      const vUnit = this.rocketBody.velocity.multiply(1 / speed);
      const deltaV = decelRate * deltaTime;
      const newSpeed = Math.max(0, speed - deltaV);
      this.rocketBody.velocity = vUnit.multiply(newSpeed);
      this.gameState.rocket.velocity = this.rocketBody.velocity.clone();

      // Heating accumulates when above the safe limit; stronger with density and over-speed
      this.heatLevel += ((overRatio - 1) * (0.6 + 1.0 * densityNorm) * 70) * deltaTime;
    } else {
      // Near the limit (85%-100%) produces slight heating
      const ratio = speed / Math.max(1, vMax);
      if (ratio > 0.85) {
        const densityNorm = Math.min(1, density / this.gameState.world.surfaceDensity);
        this.heatLevel += ((ratio - 0.85) * 20 * densityNorm) * deltaTime;
      } else {
        // Cool down slowly if comfortably within limits
        this.heatLevel = Math.max(0, this.heatLevel - 15 * deltaTime);
      }
    }

    // Visual heating feedback scales with density and speed
    const heatGlow = Math.min(1, (density / this.gameState.world.surfaceDensity) * (speed / (vMax + 1)));
    this.atmosphericGlow = Math.max(this.atmosphericGlow, heatGlow);

    // Burn-up if overheated too long
    if (!this.hasBurnedUp && this.heatLevel >= 100) {
      this.hasBurnedUp = true;
      this.atmosphereMessages.push({ text: 'Thermal failure! Vehicle burned up.', time: this.gameState.currentTime, duration: 3.0 });
      this.gameOverReason = 'Thermal failure (overheating)';
      this.createExplosion(this.gameState.rocket.position, this.gameState.rocket.velocity);
      this.destroyRocket(this.gameOverReason);
    }

    // Random structural failure chance when far over the limit
    if (!this.isGameOver && !this.gameState.world.isInSpace(altitude) && isFinite(vMax) && speed > vMax * 1.15) {
      const ratio = speed / vMax;
      const densityNorm = Math.min(1, density / this.gameState.world.surfaceDensity);
      // Probability per second increases with (ratio-1.15)^2 and density
      const pps = Math.min(0.9, (ratio - 1.15) * (ratio - 1.15) * (0.4 + 0.8 * densityNorm));
      const p = 1 - Math.exp(-pps * deltaTime); // convert to per-frame
      if (Math.random() < p) {
        this.gameOverReason = 'Aerodynamic structural failure (overspeed)';
        this.createExplosion(this.gameState.rocket.position, this.gameState.rocket.velocity);
        this.destroyRocket(this.gameOverReason);
      }
    }
  }

  /**
   * Update physics simulation
   * @param deltaTime Physics timestep
   */
  private updatePhysics(deltaTime: number): void {
    // If rocket has never been launched, keep it fixed to launch pad (properly aligned)
    if (!this.gameState.rocket.hasEverLaunched || this.gameState.rocket.isClamped) {
      // Rotate with the planet while on the pad using absolute angle so restart stays aligned
      const dims = this.rocketRenderer.getRocketBounds(this.gameState.rocket as any);
      const halfHeight = dims.height / 2;
      const nozzleDrop = 6;
      const centerRadius = this.gameState.world.planetRadius + halfHeight + nozzleDrop;

      const omega = (this.gameState.world as any).earthRotationRate || 0;
      const angle = this.padBaseAngle + omega * this.gameState.currentTime;
      const newX = Math.cos(angle) * centerRadius;
      const newY = Math.sin(angle) * centerRadius;
      const newPos = new Vector2(newX, newY);
      const tan = new Vector2(-Math.sin(angle), Math.cos(angle)).multiply(omega * centerRadius);
      this.rocketBody.position = newPos;
      this.rocketBody.velocity = tan;
      return; // Stay attached to pad until ignition
    }

    // Ground support: if at ground contact and thrust insufficient, keep resting on ground
    const dims = this.rocketRenderer.getRocketBounds(this.gameState.rocket as any);
    const halfHeight = dims.height / 2;
    const nozzleDrop = 6;
    const r = this.rocketBody.position.magnitude();
    const bottomAlt = r - (this.gameState.world.planetRadius + halfHeight + nozzleDrop);
    if (bottomAlt <= 1.5) {
      const g = this.gameState.world.getGravitationalAcceleration(r);
      const weight = this.rocketBody.mass * g;
      const thrust = this.rocketConfig.getCurrentThrust() * this.gameState.rocket.throttle;
      const twr = weight > 0 ? thrust / weight : 0;
      if (twr <= 1.01) {
        // Stay grounded: snap to ground and move with Earth rotation
        const desiredCenter = this.gameState.world.planetRadius + halfHeight + nozzleDrop + 1;
        const u = this.safeNormalize(this.rocketBody.position);
        const omega = (this.gameState.world as any).earthRotationRate || 0;
        const angle = Math.atan2(u.y, u.x);
        const newPos = new Vector2(Math.cos(angle) * desiredCenter, Math.sin(angle) * desiredCenter);
        const groundVel = new Vector2(-Math.sin(angle), Math.cos(angle)).multiply(omega * desiredCenter);
        this.rocketBody.position = newPos;
        this.rocketBody.velocity = groundVel;
        this.gameState.rocket.isOnGround = true;
        return; // skip dynamic physics while grounded
      } else {
        this.gameState.rocket.isOnGround = false; // liftoff
      }
    }

    // Clear forces
    this.rocketBody.clearForces();

    // Apply gravity
    const gravityForce = this.calculateGravityForce();
    // console.log(`Gravity force: ${gravityForce.y}N`);
    this.rocketBody.applyForce(gravityForce);

    // Apply thrust
    if (this.gameState.rocket.isEngineIgnited && this.gameState.rocket.throttle > 0) {
      const thrustForce = this.calculateThrustForce();
      // console.log(`Thrust force: ${thrustForce.y}N, Mass: ${this.rocketBody.mass}kg, TWR: ${thrustForce.y / (this.rocketBody.mass * 9.81)}`);
      this.rocketBody.applyForce(thrustForce);

      // Consume fuel
      const fuelConsumed = this.rocketConfig.consumeFuel(deltaTime, this.gameState.rocket.throttle);
      
      // Auto-shutdown engines if fuel depleted
      if (!fuelConsumed || this.rocketConfig.getCurrentThrust() === 0) {
        this.gameState.rocket.isEngineIgnited = false;
        this.gameState.rocket.throttle = 0;
        console.log('🔥 Fuel depleted! Engines automatically shut down.');
        this.sound?.stopEngine();
      }
    }

    // Apply atmospheric drag
    const altitude = this.gameState.world.getAltitude(this.rocketBody.position.magnitude());
    if (altitude < 80_000) {
      // Only apply drag in atmosphere
      const dragForce = this.calculateDragForce();
      this.rocketBody.applyForce(dragForce);
    }

    // Update rocket mass
    this.rocketBody.setMass(this.rocketConfig.getCurrentMass());

    // Integrate physics
    this.rocketBody.integrate(deltaTime);

    // Check for ground collision regardless of engine state
    if (this.gameState.world.isBelowSurface(this.rocketBody.position.magnitude())) {
      this.handleGroundCollision();
    }
  }

  /**
   * Calculate gravitational force
   * @returns Gravity force vector
   */
  private calculateGravityForce(): Vector2 {
    const position = this.rocketBody.position;
    const distance = position.magnitude();
    const gravity = this.gameState.world.getGravitationalAcceleration(distance);
    const direction = this.safeNormalize(position).multiply(-1); // Toward planet center

    return direction.multiply(gravity * this.rocketBody.mass);
  }

  /**
   * Calculate thrust force
   * @returns Thrust force vector
   */
  private calculateThrustForce(): Vector2 {
    const thrust = this.rocketConfig.getCurrentThrust() * this.gameState.rocket.throttle;
    // 0 rotation = up; positive rotation = tilt left visually. Use -sin so thrust points left for positive rotation.
    const direction = new Vector2(-Math.sin(this.rocketBody.rotation), Math.cos(this.rocketBody.rotation));
    // console.log(`Raw thrust: ${this.rocketConfig.getCurrentThrust()}N, throttle: ${this.gameState.rocket.throttle}, direction: (${direction.x}, ${direction.y})`);

    return direction.multiply(thrust);
  }

  /**
   * Calculate atmospheric drag force
   * @returns Drag force vector
   */
  private calculateDragForce(): Vector2 {
    const altitude = this.gameState.world.getAltitude(this.rocketBody.position.magnitude());
    // Strictly no aerodynamic effect at/above 80 km
    if (altitude >= 80_000) {
      this.aeroCdEff = this.rocketConfig.dragCoefficient;
      this.aeroAreaEff = this.rocketConfig.crossSectionalArea;
      this.lastMach = 0;
      this.lastAoADeg = 0;
      return Vector2.zero();
    }
    // Only compute in appreciable atmosphere; density decays fast, but clamp to <80 km focus
    const density = this.gameState.world.getAtmosphericDensity(altitude);

    // Air-relative velocity (air moves with planet rotation). This makes
    // near-ground speed more realistic. We subtract ground wind (rotation).
    const airVel = this.rocketBody.velocity.subtract(this.getGroundVelocityAt(this.rocketBody.position));
    const speed = airVel.magnitude();
    if (speed < 0.01 || density <= 0) {
      this.aeroCdEff = this.rocketConfig.dragCoefficient;
      this.aeroAreaEff = this.rocketConfig.crossSectionalArea;
      this.lastMach = 0;
      this.lastAoADeg = 0;
      return Vector2.zero();
    }

    // Angle of attack: angle between rocket forward and the air flow,
    // computed via dot product and arccos.
    const fwd = new Vector2(-Math.sin(this.rocketBody.rotation), Math.cos(this.rocketBody.rotation));
    const flow = airVel.multiply(-1 / speed); // unit vector opposite velocity
    const dot = Math.max(-1, Math.min(1, fwd.x * flow.x + fwd.y * flow.y));
    const aoa = Math.acos(dot); // radians

    // Simple Mach estimate with our speed of sound model.
    const a = this.gameState.world.getSpeedOfSound(altitude);
    const mach = speed / Math.max(1, a);

    // Effective reference area varies with attitude (front-on vs side-on)
    // Front area = config area; side area ~6x for a slender rocket.
    // Not real CFD, just simple and clear.
    const aFront = this.rocketConfig.crossSectionalArea;
    const sideMul = 6; // side-on projected area multiplier
    const sin2 = Math.sin(aoa) * Math.sin(aoa);
    const cos2 = 1 - sin2;
    const areaEff = aFront * (cos2 + sideMul * sin2);

    // Base Cd from config; grow with AoA and add a transonic bump around Mach 1.
    const cdBase = this.rocketConfig.dragCoefficient; // ~0.3
    // AoA factor (0 at 0°, ~+4x at 90°)
    const cdAoA = 1 + 4 * sin2;
    // Mach factor: bump near M≈1, mild rise into supersonic
    let cdMach = 1;
    if (mach >= 0.8 && mach <= 1.2) {
      // Peak at M=1 (triangle bump up to +1.5x)
      const t = 1 - Math.abs(mach - 1) / 0.4; // 0..1
      cdMach = 1 + 1.5 * Math.max(0, t);
    } else if (mach > 1.2) {
      // Mild increase up to +30% by M≈3
      cdMach = 1.1 + 0.1 * Math.min(1, (mach - 1.2) / 1.8);
    }

    const cdEff = cdBase * cdAoA * cdMach;

    // Store effective values for HUD/limits so UI can show what we use
    this.aeroCdEff = cdEff;
    this.aeroAreaEff = areaEff;
    this.lastMach = mach;
    this.lastAoADeg = (aoa * 180) / Math.PI;

    return AtmosphericPhysics.calculateDragForce(
      airVel,
      density,
      cdEff,
      areaEff
    );
  }

  /**
   * Update rocket state from physics body
   */
  private updateRocketState(): void {
    this.gameState.rocket.position = this.rocketBody.position.clone();
    this.gameState.rocket.velocity = this.rocketBody.velocity.clone();
    this.gameState.rocket.rotation = this.rocketBody.rotation;
    this.gameState.rocket.visualRotation = this.visualRotation;
    this.gameState.rocket.mass = this.rocketBody.mass;
    this.gameState.rocket.stages = this.rocketConfig.stages;
    // Expose effective values so HUD and helpers reflect current aero
    this.gameState.rocket.dragCoefficient = this.aeroCdEff;
    this.gameState.rocket.crossSectionalArea = this.aeroAreaEff;
    this.gameState.rocket.fuel = this.rocketConfig.stages.reduce(
      (sum, stage) => sum + stage.fuelRemaining,
      0
    );
  }

  /**
   * Handle ground collision
   */
  private handleGroundCollision(): void {
    console.log('Ground collision detected!');
    
    // Check relative impact speed (ignore ground rotation)
    const groundVel = this.getGroundVelocityAt(this.rocketBody.position);
    const impactSpeed = this.rocketBody.velocity.subtract(groundVel).magnitude();
    if (impactSpeed > 15.0) {
      console.log(`💥 HIGH-SPEED GROUND IMPACT! Speed: ${impactSpeed.toFixed(1)} m/s - EXPLOSION!`);
      
      // Create explosion at impact site
      this.createExplosion(this.gameState.rocket.position, this.gameState.rocket.velocity);
      
      // Destroy rocket completely - game over
      this.gameOverReason = 'High-speed ground impact';
      this.destroyRocket(this.gameOverReason);
      return;
    }
    
    // Soft landing - stop the rocket at current position
    console.log(`Soft landing! Impact speed: ${impactSpeed.toFixed(1)} m/s`);
    this.rocketBody.velocity = Vector2.zero();
    
    // Place rocket bottom at ground contact using visual half-height
    const currentDistance = this.rocketBody.position.magnitude();
    const surfaceDistance = this.gameState.world.planetRadius;
    const dims = this.rocketRenderer.getRocketBounds(this.gameState.rocket as any);
    const halfHeight = dims.height / 2;
    const desiredCenter = surfaceDistance + halfHeight + 1;
    if (currentDistance < desiredCenter) {
      const normalizedPos = this.safeNormalize(this.rocketBody.position);
      this.rocketBody.position = normalizedPos.multiply(desiredCenter);
    }
    // Otherwise, leave rocket at current position (it might just be very close to surface)
  }

  /**
   * Render the game
   */
  private render(): void {
    this.renderer.clear();
    this.renderer.beginFrame();

    // Draw planet surface
    this.drawPlanet();

    // Draw background elements (buildings, clouds, etc.)
    // Note: staging elements are now drawn after the rocket for better layering
    this.drawBackgroundElements();

    // Draw rocket (only if not exploding or game over)
    if (!this.explosionPhase && !this.isGameOver) {
      this.rocketRenderer.render(this.renderer, this.gameState.rocket);
    }

    // Draw staging elements after rocket so they share the same visual layer initially
    this.drawStagingElements();

    this.renderer.endFrame();

    // Draw HUD
    if (this.showHUD) {
      this.hudSystem.render(this.renderer, this.gameState, this.missionTimer);
      if (this.debugEnabled) this.renderDebugOverlay();
      // Draw space fact bubbles as UI overlay (HUD-like)
      this.drawFactBubbles();
      // Draw atmosphere messages on top of HUD
      this.drawAtmosphereMessages();
    }
    
    // Draw game over screen if needed
    if (this.isGameOver) {
      this.renderGameOverScreen();
    }
  }

  private renderDebugOverlay(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    const panelX = this.canvas.width - 220;
    const panelY = 10;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(panelX, panelY, 210, 90);
    ctx.strokeStyle = '#00ff00';
    ctx.strokeRect(panelX, panelY, 210, 90);
    ctx.fillStyle = '#00ff00';
    ctx.font = '12px monospace';
    const rotDeg = (this.rocketBody.rotation * 180 / Math.PI).toFixed(2);
    const avDeg = (this.angularVelocity * 180 / Math.PI).toFixed(2);
    ctx.fillText('Debug: ON (L to toggle)', panelX + 8, panelY + 18);
    ctx.fillText(`Rot: ${rotDeg}°  AV: ${avDeg}°/s`, panelX + 8, panelY + 36);
    ctx.fillText(`Left:${this.turnLeft?'1':'0'} Right:${this.turnRight?'1':'0'}`, panelX + 8, panelY + 54);
    ctx.fillText(`Throttle: ${(this.gameState.rocket.throttle*100).toFixed(0)}%`, panelX + 8, panelY + 72);
    ctx.restore();
  }

  /**
   * Draw the planet with sky gradient and atmosphere
   */
  private drawPlanet(): void {
    const planetCenter = Vector2.zero();
    const planetRadius = this.gameState.world.planetRadius;
    const rocketAltitude = this.gameState.world.getAltitude(this.gameState.rocket.position.magnitude());

    // Draw sky gradient background based on altitude
    this.drawSkyGradient(rocketAltitude);

    // Draw planet as a large circle (most of it will be off-screen)
    this.renderer.drawCircle(planetCenter, planetRadius, '#4a5d23', '#2d3a16', 2);

    // Draw atmosphere layers
    this.drawAtmosphere(planetCenter, planetRadius, rocketAltitude);
  }

  /**
   * Draw sky gradient that changes with altitude
   */
  private drawSkyGradient(altitude: number): void {
    // Radial gradient centered at planet, simulating atmospheric scattering
    const planetCenter = Vector2.zero();
    const planetRadius = this.gameState.world.planetRadius;
    const atmoThickness = 100_000; // nominal atmosphere
    const glowBleed = 250_000;     // extend faint glow beyond atmosphere

    // Smooth fade: keep a subtle glow even well outside the atmosphere
    const smoothstep = (a: number, b: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };

    // t = 1 near ground, smoothly down to 0 by glowBleed altitude
    const t = 1 - smoothstep(0, glowBleed, altitude);
    const alpha = 0.05 + 0.75 * t; // 0.05 far space .. 0.8 near ground
    const inner = `rgba(135, 206, 235, ${alpha.toFixed(3)})`; // light blue
    const outer = '#0F0F23'; // deep space blue

    // Paint the radial gradient in screen space (extend to glowBleed)
    this.renderer.fillRadialGradientWorld(
      planetCenter,
      planetRadius,
      planetRadius + glowBleed,
      inner,
      outer
    );
  }

  /**
   * Draw atmospheric layers
   */
  private drawAtmosphere(planetCenter: Vector2, planetRadius: number, altitude: number): void {
    if (altitude < 100_000) {
      // Draw visible atmosphere haze near surface
      const atmosphereRadius = planetRadius + 50_000;
      const opacity = Math.max(0.05, 0.3 * (1 - altitude / 100_000));
      this.renderer.drawCircle(
        planetCenter,
        atmosphereRadius,
        undefined,
        `rgba(135, 206, 235, ${opacity})`,
        1
      );
    }
  }

  /**
   * Draw background elements directly
   */
  private drawBackgroundElements(): void {
    const altitude = this.gameState.world.getAltitude(this.gameState.rocket.position.magnitude());
    
    // Update background elements
    this.updateBackgroundElements();
    
    // Draw moon and stars at high altitude
    if (altitude > 10_000) {
      this.drawMoon();
    }
    if (altitude > 50_000) {
      this.drawStars();
    }
    
    // (Buildings removed)
    
    // Draw clouds at medium altitude
    if (altitude < 15_000) {
      this.drawClouds();
    }
    
    // Draw flying objects
    if (altitude < 25_000) {
      this.drawBirds();
      this.drawPlanes();
    }
    
    // Staging elements now draw after rocket for better scale/layering
    
    // Draw explosions
    this.drawExplosions();
    
    // Draw speed effects
    this.drawSpeedEffects();

    // (Local launch overlay removed)
  }

  /**
   * Ground tangential velocity at a world position due to planet rotation
   */
  private getGroundVelocityAt(pos: Vector2): Vector2 {
    const omega = (this.gameState.world as any).earthRotationRate || 0;
    const r = pos.magnitude();
    if (r < 1e-6 || omega === 0) return Vector2.zero();
    const u = this.safeNormalize(pos);
    const t = new Vector2(-u.y, u.x);
    return t.multiply(omega * r);
  }

  // === SPACE FACTS METHODS ===
  private loadShownFacts(): void {
    try {
      const raw = localStorage.getItem('shownSpaceFacts');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) this.shownFacts = new Set(arr);
      }
    } catch {}
  }

  private saveShownFacts(): void {
    try {
      localStorage.setItem('shownSpaceFacts', JSON.stringify(Array.from(this.shownFacts)));
    } catch {}
  }

  private updateFactBubbles(_deltaTime: number): void {
    const now = Date.now();
    for (let i = this.factBubbles.length - 1; i >= 0; i--) {
      const b = this.factBubbles[i];
      const age = (now - b.bornAtMs) / 1000;
      const t = age / b.ttlSec;
      // Ease: fade in first 0.2, fade out last 0.2
      b.opacity = Math.max(0, Math.min(1, t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 1));
      if (age >= b.ttlSec) this.factBubbles.splice(i, 1);
    }
  }

  private drawFactBubbles(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const now = Date.now();
    for (const b of this.factBubbles) {
      // Slide-in/out offset based on lifetime seconds
      const inDur = 0.3;
      const outDur = 0.3;
      const lifeSec = Math.max(0, (now - b.bornAtMs) / 1000);
      const maxLifeSec = Math.max(0.001, b.ttlSec);
      const tIn = Math.min(1, lifeSec / inDur);
      const tOut = Math.max(0, (maxLifeSec - lifeSec) / outDur);
      const slide = Math.min(tIn, tOut); // 0..1
      const ease = (p: number) => p * p * (3 - 2 * p); // smoothstep
      const slideOffset = (1 - ease(slide)) * 24; // px from right

      const panelW = 320;
      const panelH = 120;
      const x = b.pos.x + slideOffset - panelW / 2;
      const y = b.pos.y - panelH / 2;

      // Panel background with rounded corners
      const r = 10;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + panelW - r, y);
      ctx.quadraticCurveTo(x + panelW, y, x + panelW, y + r);
      ctx.lineTo(x + panelW, y + panelH - r);
      ctx.quadraticCurveTo(x + panelW, y + panelH, x + panelW - r, y + panelH);
      ctx.lineTo(x + r, y + panelH);
      ctx.quadraticCurveTo(x, y + panelH, x, y + panelH - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fillStyle = `rgba(20, 40, 80, ${0.85 * b.opacity})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(120, 170, 240, ${b.opacity})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Header
      ctx.fillStyle = `rgba(180, 220, 255, ${b.opacity})`;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('SPACE FACT', x + 12, y + 18);

      // Text
      ctx.fillStyle = `rgba(255,255,255, ${b.opacity})`;
      ctx.font = '12px monospace';
      const lines = this.wrapText(ctx, b.text, panelW - 24);
      let ty = y + 40;
      for (const line of lines) {
        ctx.fillText(line, x + 12, ty);
        ty += 16;
      }
    }
    ctx.restore();
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  private maybeSpawnFact(): void {
    const t = this.gameState.currentTime;
    const altitude = this.gameState.world.getAltitude(this.gameState.rocket.position.magnitude());
    // Show facts only once above 5 km; no upper limit
    const inRange = altitude >= 5_000; // from 5 km upward
    if (!inRange) return;

    const now = Date.now();
    if ((now - this.lastFactSpawnWallMs) / 1000 >= this.nextFactInterval) {
      // Pick a fact index not yet shown
      const factsArr: string[] = (spaceFacts as unknown as string[]);
      const available: number[] = [];
      for (let i = 0; i < factsArr.length; i++) {
        if (!this.shownFacts.has(i)) available.push(i);
      }
      if (available.length === 0) {
        // All facts shown; stop scheduling
        this.nextFactInterval = Number.POSITIVE_INFINITY;
        return;
      }
      const idx = available[Math.floor(Math.random() * available.length)];
      const fact = factsArr[idx];
      this.shownFacts.add(idx);
      this.saveShownFacts();

      // Spawn bubble pinned to the right side, fixed height so it never covers apo/peri labels
      const screenW = this.canvas.width;
      const panelWidth = 320;
      const margin = 20;
      const x = screenW - panelWidth / 2 - margin; // right inset
      const y = 60; // fixed top height
      const pos = new Vector2(x, y);
      const vel = new Vector2(0, 0); // no drift in screen space
      this.factBubbles.push({ text: fact, pos, vel, bornAtMs: now, ttlSec: 12 + Math.random() * 4, opacity: 0 });

      this.lastFactSpawnWallMs = now;
      this.nextFactInterval = 20 + Math.random() * 25; // 20–45s
    }
  }

  /**
   * Update background elements (spawn new ones, move existing ones)
   */
  private updateBackgroundElements(): void {
    const currentTime = this.gameState.currentTime;
    
    // Spawn clouds every 3-8 seconds
    if (currentTime - this.lastCloudSpawn > 3 + Math.random() * 5) {
      this.spawnCloud();
      this.lastCloudSpawn = currentTime;
    }
    
    // Spawn birds every 5-15 seconds
    if (currentTime - this.lastBirdSpawn > 5 + Math.random() * 10) {
      this.spawnBirds();
      this.lastBirdSpawn = currentTime;
    }
    
    // Spawn planes every 20-60 seconds
    if (currentTime - this.lastPlaneSpawn > 20 + Math.random() * 40) {
      this.spawnPlane();
      this.lastPlaneSpawn = currentTime;
    }
    
    // Update positions
    this.updateClouds();
    this.updateBirds();
    this.updatePlanes();
  }

  private spawnCloud(): void {
    const rocketPos = this.gameState.rocket.position;
    // Spawn clouds around the rocket at various altitudes
    this.clouds.push({
      pos: new Vector2(
        rocketPos.x + (Math.random() - 0.5) * 10000,
        rocketPos.y + Math.random() * 5000 + 1000
      ),
      size: 30 + Math.random() * 50,
      opacity: 0.3 + Math.random() * 0.4
    });
    // Limit cloud count
    if (this.clouds.length > 15) this.clouds.shift();
  }

  private spawnBirds(): void {
    const rocketPos = this.gameState.rocket.position;
    // Spawn a flock of birds
    for (let i = 0; i < 3 + Math.random() * 5; i++) {
      this.birds.push({
        pos: new Vector2(
          rocketPos.x + (Math.random() - 0.5) * 8000,
          rocketPos.y + Math.random() * 2000 + 200
        ),
        vel: new Vector2((Math.random() - 0.5) * 30 + 15, (Math.random() - 0.5) * 10),
        wingPhase: Math.random() * Math.PI * 2
      });
    }
    if (this.birds.length > 20) this.birds.splice(0, 5);
  }

  private spawnPlane(): void {
    const rocketPos = this.gameState.rocket.position;
    this.planes.push({
      pos: new Vector2(
        rocketPos.x + (Math.random() - 0.5) * 15000,
        rocketPos.y + Math.random() * 8000 + 3000
      ),
      vel: new Vector2((Math.random() - 0.5) * 200 + 100, (Math.random() - 0.5) * 50),
      type: Math.random() > 0.7 ? 'fighter' : 'airliner'
    });
    if (this.planes.length > 5) this.planes.shift();
  }

  private updateClouds(): void {
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const cloud = this.clouds[i];
      cloud.pos.x += 5; // Wind drift
      const dist = cloud.pos.subtract(this.gameState.rocket.position).magnitude();
      if (dist > 20000) this.clouds.splice(i, 1);
    }
  }

  private updateBirds(): void {
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const bird = this.birds[i];
      bird.pos = bird.pos.add(bird.vel.multiply(1/60));
      bird.wingPhase += 0.3;
      const dist = bird.pos.subtract(this.gameState.rocket.position).magnitude();
      if (dist > 15000) this.birds.splice(i, 1);
    }
  }

  private updatePlanes(): void {
    for (let i = this.planes.length - 1; i >= 0; i--) {
      const plane = this.planes[i];
      plane.pos = plane.pos.add(plane.vel.multiply(1/60));
      const dist = plane.pos.subtract(this.gameState.rocket.position).magnitude();
      if (dist > 25000) this.planes.splice(i, 1);
    }
  }

  /**
   * Draw realistic Kennedy Space Center buildings
   */
  // (Buildings removed)

  private drawClouds(): void {
    for (const cloud of this.clouds) {
      this.drawCloud(cloud.pos, cloud.size, cloud.opacity);
    }
  }

  private drawCloud(pos: Vector2, size: number, opacity: number): void {
    const puffs = 4 + Math.floor(size / 15);
    for (let i = 0; i < puffs; i++) {
      const angle = (i / puffs) * Math.PI * 2;
      const puffPos = new Vector2(
        pos.x + Math.cos(angle) * size * 0.3,
        pos.y + Math.sin(angle) * size * 0.2
      );
      this.renderer.drawCircle(puffPos, size / 2, `rgba(255, 255, 255, ${opacity})`);
    }
  }

  private drawBirds(): void {
    for (const bird of this.birds) {
      this.drawBird(bird.pos, bird.wingPhase);
    }
  }

  private drawBird(pos: Vector2, wingPhase: number): void {
    const wingSpan = 8;
    const wingFlap = Math.sin(wingPhase) * 0.5;
    
    // Bird body
    this.renderer.drawLine(
      new Vector2(pos.x, pos.y - 2),
      new Vector2(pos.x, pos.y + 2),
      '#333333', 2
    );
    
    // Wings
    this.renderer.drawLine(
      pos,
      new Vector2(pos.x - wingSpan, pos.y - wingSpan/3 + wingFlap * 4),
      '#333333', 1
    );
    this.renderer.drawLine(
      pos,
      new Vector2(pos.x + wingSpan, pos.y - wingSpan/3 + wingFlap * 4),
      '#333333', 1
    );
  }

  private drawPlanes(): void {
    for (const plane of this.planes) {
      this.drawPlane(plane.pos, plane.type);
    }
  }

  private drawPlane(pos: Vector2, type: 'airliner' | 'fighter'): void {
    if (type === 'airliner') {
      // Airliner
      this.renderer.drawRectangle(new Vector2(pos.x - 15, pos.y - 1), 30, 2, '#ffffff');
      this.renderer.drawRectangle(new Vector2(pos.x - 5, pos.y - 8), 10, 16, '#e0e0e0');
      this.renderer.drawRectangle(new Vector2(pos.x + 10, pos.y - 4), 8, 8, '#e0e0e0');
    } else {
      // Fighter jet
      this.renderer.drawRectangle(new Vector2(pos.x - 8, pos.y - 1), 16, 2, '#666666');
      this.renderer.drawRectangle(new Vector2(pos.x - 3, pos.y - 6), 6, 12, '#555555');
    }
  }

  private drawMoon(): void {
    const rocketPos = this.gameState.rocket.position;
    const moonPos = new Vector2(rocketPos.x + 20000, rocketPos.y + 30000);
    
    this.renderer.drawCircle(moonPos, 100, '#f5f5dc', '#cccccc', 2);
    // Craters
    this.renderer.drawCircle(new Vector2(moonPos.x - 25, moonPos.y - 15), 10, '#e8e8e8');
    this.renderer.drawCircle(new Vector2(moonPos.x + 30, moonPos.y + 20), 15, '#e8e8e8');
    this.renderer.drawCircle(new Vector2(moonPos.x - 5, moonPos.y + 35), 8, '#e8e8e8');
  }

  private drawStars(): void {
    const rocketPos = this.gameState.rocket.position;
    // Draw random stars around rocket
    for (let i = 0; i < 50; i++) {
      const starPos = new Vector2(
        rocketPos.x + (Math.random() - 0.5) * 50000,
        rocketPos.y + (Math.random() - 0.5) * 50000 + 20000
      );
      const brightness = Math.random() * 0.8 + 0.2;
      this.renderer.drawCircle(starPos, 1, `rgba(255, 255, 255, ${brightness})`);
    }
  }

  // Command API methods
  igniteEngines(): boolean {
    // Check if current stage has fuel
    const activeStage = this.rocketConfig.getActiveStage();
    if (!activeStage || activeStage.fuelRemaining <= 0) {
      console.log('❌ Cannot ignite - no fuel remaining in current stage!');
      return false;
    }

    const thrust = this.rocketConfig.getCurrentThrust();
    console.log(`Attempting ignition - thrust: ${thrust}, fuel: ${activeStage.fuelRemaining}kg`);
    if (thrust > 0) {
      this.gameState.rocket.isEngineIgnited = true;
      this.gameState.rocket.hasEverLaunched = true; // Mark as launched
      // Auto-set some throttle for easier testing
      this.gameState.rocket.throttle = 0.5; // 50% throttle
      // Auto-release pad clamps on initial ignition
      if (this.gameState.rocket.isClamped) {
        this.gameState.rocket.isClamped = false;
        console.log('🧰 Pad clamps auto-released. Liftoff!');
      }
      console.log('✅ Engine start! Throttle 50%');
      // Stage-specific loudness (upper stages a bit quieter)
      const stageIdx = this.rocketConfig.getCurrentStageIndex();
      this.sound?.setBaseGain(getEngineBaseGainForStage(stageIdx));
      // First ignition has louder start; subsequent ignitions a bit quieter
      const startLoud = this.firstIgnitionPlayed ? 0.7 : 1.0;
      this.firstIgnitionPlayed = true;
      // Start engine sound (start clip then loop)
      this.sound?.startEngine(this.gameState.rocket.throttle, startLoud).catch(() => {});
      return true;
    }
    console.log('❌ No thrust available - ignition failed');
    return false;
  }

  setThrottle(value: number): void {
    this.gameState.rocket.throttle = Math.max(0, Math.min(1, value));
    console.log(`Throttle set to ${(this.gameState.rocket.throttle * 100).toFixed(0)}%`);
    if (this.gameState.rocket.isEngineIgnited) {
      this.sound?.setThrottle(this.gameState.rocket.throttle);
    }
  }

  cutEngines(): void {
    this.gameState.rocket.isEngineIgnited = false;
    this.gameState.rocket.throttle = 0;
    console.log('🔥 Engines cut! Complete engine shutdown.');
    this.sound?.stopEngine();
  }

  performStaging(): boolean {
    const currentThrust = this.rocketConfig.getCurrentThrust() * this.gameState.rocket.throttle;

    // Check if this would cause explosion (engines on)
    if (this.rocketConfig.wouldExplodeOnStaging(currentThrust)) {
      console.log('💥 EXPLOSION! Cannot stage with engines firing - catastrophic failure!');
      
      // Create explosion at rocket position
      this.createExplosion(this.gameState.rocket.position, this.gameState.rocket.velocity);
      
      // Destroy rocket completely - game over
      this.gameOverReason = 'Staging while engines firing';
      this.destroyRocket(this.gameOverReason);
      
      return false;
    }

    // Store current physics state before staging
    const currentPosition = this.rocketBody.position.clone();
    const currentVelocity = this.rocketBody.velocity.clone();
    
    if (this.rocketConfig.performStaging()) {
      // Update game state
      this.gameState.rocket.currentStage = this.rocketConfig.getCurrentStageIndex();
      
      // Explicitly preserve position and velocity during staging
      this.rocketBody.position = currentPosition;
      this.rocketBody.velocity = currentVelocity;
      
      // Update mass to reflect the jettisoned stage
      this.rocketBody.setMass(this.rocketConfig.getCurrentMass());
      
      // Create staging animation
      this.createStagingAnimation(currentPosition, currentVelocity);
      
      console.log('✅ Stage separated safely! Position and velocity preserved.');
      return true;
    }
    console.log('Cannot stage - no more stages available');
    return false;
  }

  // === STAGING ANIMATION METHODS ===
  
  private createStagingAnimation(position: Vector2, velocity: Vector2): void {
    this.lastStagingTime = this.gameState.currentTime;
    
    // Create the separated stage - keeps almost the same velocity as the rocket
    const currentStageIndex = this.gameState.rocket.currentStage - 1; // Previous stage that was separated
    
    // Separation: drift gently down along rocket orientation
    const rocketDown = new Vector2(Math.sin(this.gameState.rocket.rotation), -Math.cos(this.gameState.rocket.rotation));
    const separationVel = velocity.add(rocketDown.multiply(5));
    
    // Spawn 20–25px below the current stage bottom (engine exit)
    const exhaustLocalY = this.gameState.rocket.exhaustY;
    let bottomDistance: number;
    if (typeof exhaustLocalY === 'number') {
      bottomDistance = Math.max(10, -exhaustLocalY);
    } else {
      const dims = this.rocketRenderer.getRocketBounds(this.gameState.rocket as any);
      bottomDistance = Math.max(10, dims.height / 2);
    }
    const baseBottom = position.add(rocketDown.multiply(bottomDistance));
    const offset = 20 + Math.random() * 5;
    const separatedStagePos = baseBottom.add(rocketDown.multiply(offset));
    
    this.separatedStages.push({
      pos: separatedStagePos,
      vel: separationVel,
      rotation: this.gameState.rocket.rotation, // keep same orientation
      rotSpeed: 0, // no rotation over time
      life: 30.0, // Visible for 30 seconds - longer visibility
      stageIndex: Math.max(0, currentStageIndex),
      bornTime: this.gameState.currentTime,
      age: 0,
      landed: false
    });
    
    // Create some small debris pieces
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const speed = 10 + Math.random() * 20; // Smaller debris
      
      this.stagingDebris.push({
        pos: position.clone(),
        vel: new Vector2(
          velocity.x + Math.cos(angle) * speed,
          velocity.y + Math.sin(angle) * speed
        ),
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 10,
        life: 2.0 // 2 seconds for small debris
      });
    }
  }
  
  private updateStagingAnimation(deltaTime: number): void {
    // Update debris
    for (let i = this.stagingDebris.length - 1; i >= 0; i--) {
      const debris = this.stagingDebris[i];
      debris.pos = debris.pos.add(debris.vel.multiply(deltaTime));
      debris.rotation += debris.rotSpeed * deltaTime;
      debris.life -= deltaTime;
      
      if (debris.life <= 0) {
        this.stagingDebris.splice(i, 1);
      }
    }
    
    // Update separated stages
    for (let i = this.separatedStages.length - 1; i >= 0; i--) {
      const stage = this.separatedStages[i];
      if (stage.landed) {
        // Keep landed stage in place; slowly fade life if desired
        stage.life -= deltaTime * 0.0; // keep indefinitely for now
        if (stage.life <= 0) this.separatedStages.splice(i, 1);
        continue;
      }
      stage.age += deltaTime;
      
      // Apply physics to separated stages (gravity, etc.)
      const stagePosition: Vector2 = stage.pos;
      
      const gravityMagnitude = this.gameState.world.getGravitationalAcceleration(stagePosition.magnitude());
      
      // Safely normalize position (avoid divide by zero and method errors)
      const positionMagnitude = stagePosition.magnitude();
      let gravityDirection: Vector2;
      
      gravityDirection = this.safeNormalize(stagePosition).multiply(-1);
      
      const gravityAccel = gravityDirection.multiply(gravityMagnitude);

      // No extra retro-thruster push; keep motion simple
      
      // Update velocity
      stage.vel = stage.vel.add(gravityAccel.multiply(deltaTime));

      // Gentle drift down along gravity only
      
      // Update position is done elsewhere; ensure ground collision after physics
      // Ground collision for separated stages
      const stageAltitude = this.gameState.world.getAltitude(stage.pos.magnitude());
      if (stageAltitude <= 0) {
        const impactSpeed = stage.vel.magnitude();
        if (impactSpeed > 15) {
          // Explode stage on hard impact
          this.createExplosion(stage.pos, stage.vel);
          this.separatedStages.splice(i, 1);
          continue;
        } else {
          // Soft land: stop motion and sit on surface
          const surfaceNorm = this.safeNormalize(stage.pos);
          stage.pos = surfaceNorm.multiply(this.gameState.world.planetRadius + 1);
          stage.vel = new Vector2(0, 0);
          stage.landed = true;
        }
      }
      if (!stage.landed) {
        stage.pos = stage.pos.add(stage.vel.multiply(deltaTime));
      }
      // Rotation locked to remove wobble
      stage.life -= deltaTime;
      
      // Cull when far off the bottom of the screen (unless landed)
      const screenPos = this.renderer.worldToScreen(stage.pos);
      const viewSize = this.renderer.getSize();
      if (!stage.landed && screenPos.y > viewSize.y + 120) {
        stage.life = 0;
      }

      if (stage.life <= 0) {
        this.separatedStages.splice(i, 1);
      }
    }
  }
  
  private drawStagingElements(): void {
    // Draw separated stages
    for (const stage of this.separatedStages) {
      const alpha = Math.max(0, Math.min(1, stage.life / 30.0)); // Fade out over 30 seconds

      // Simple visual for separated stage (no special foreground animation)
      this.renderer.drawRotated(stage.pos, stage.rotation, () => {
        if (stage.stageIndex === 0) {
          this.renderer.drawRectangle(
            new Vector2(-8, -25),
            16, 50,
            `rgba(240, 240, 240, ${alpha})`,
            `rgba(44, 90, 160, ${alpha})`,
            2
          );
        } else {
          this.renderer.drawRectangle(
            new Vector2(-6, -18),
            12, 36,
            `rgba(255, 255, 255, ${alpha})`,
            `rgba(192, 57, 43, ${alpha})`,
            2
          );
        }
      });
    }
    
    // Draw debris
    for (const debris of this.stagingDebris) {
      const alpha = Math.max(0, debris.life / 2.0); // Fade out over 2 seconds
      this.renderer.drawRotated(debris.pos, debris.rotation, () => {
        this.renderer.drawRectangle(
          new Vector2(-3, -1),
          6, 2,
          `rgba(200, 200, 200, ${alpha})`,
          `rgba(100, 100, 100, ${alpha})`,
          1
        );
      });
    }
  }

  // === SPEED EFFECTS METHODS ===
  
  private updateSpeedEffects(deltaTime: number): void {
    const velocity = this.gameState.rocket.velocity;
    const speed = velocity.magnitude();
    const position = this.gameState.rocket.position;
    const altitude = this.gameState.world.getAltitude(position.magnitude());
    const rotation = this.gameState.rocket.rotation;
    // Compute down direction along the rocket body (rotate (0,-1) by +rotation)
    const rocketDown = new Vector2(Math.sin(rotation), -Math.cos(rotation));
    const exhaustLocalY = this.gameState.rocket.exhaustY;
    let bottomDistance: number;
    if (typeof exhaustLocalY === 'number') {
      bottomDistance = Math.max(10, -exhaustLocalY);
    } else {
      const dims = this.rocketRenderer.getRocketBounds(this.gameState.rocket as any);
      bottomDistance = Math.max(10, dims.height / 2);
    }
    const engineBase = position.add(rocketDown.multiply(bottomDistance));
    
    // Get atmospheric density (0-1, where 1 is sea level)
    const atmosphericDensity = this.gameState.world.getAtmosphericDensity(altitude);
    
    // Calculate effect intensity based on speed and atmospheric density
    const speedThreshold = 50; // m/s - lower threshold for effects
    const maxSpeed = 1000; // m/s - lower max speed for better scaling
    const speedFactor = Math.min(1, Math.max(0, (speed - speedThreshold) / (maxSpeed - speedThreshold)));
    
    // Effect intensity scales with both speed and atmospheric density
    const effectIntensity = speedFactor * atmosphericDensity;
    
    // Update atmospheric glow for heating effects
    this.atmosphericGlow = effectIntensity;
    
    
    const exhaustLen = (this.gameState.rocket as any).exhaustLength ?? 32;
    const halfPlume = Math.max(16, exhaustLen * 0.7); // slightly deeper into plume

    // Create velocity streaks if moving fast enough in atmosphere
    if (effectIntensity > 0.01) { // Much lower threshold
      const streakCount = Math.floor(effectIntensity * 8); // 0-8 streaks
      
      for (let i = 0; i < streakCount; i++) {
        // Create streaks where air friction occurs - opposite to velocity direction
        const velocityAngle = Math.atan2(velocity.x, velocity.y);
        const rocketRotation = this.gameState.rocket.rotation;
        
        // Distance from engine along plume for streak start
        const frictionDistance = 18 + Math.random() * 18;
        
        // Position streaks opposite to velocity direction (where air hits the rocket)
        const velocityOppositeAngle = velocityAngle + Math.PI; // 180 degrees opposite
        
        // Minimal lateral spread to keep aligned with nozzle
        const spreadAngle = (Math.random() - 0.5) * 0.2; // ±6 degrees spread
        const effectiveAngle = velocityOppositeAngle + spreadAngle;
        
        // Calculate position where air friction creates the visual effect
        const frictionOffset = new Vector2(
          Math.sin(effectiveAngle) * frictionDistance,
          -Math.cos(effectiveAngle) * frictionDistance
        );
        // Start streaks slightly within the plume along rocketDown direction
        const startBase = engineBase.add(rocketDown.multiply(Math.min(frictionDistance + 10, halfPlume + 12)));
        const streakPos = startBase.add(frictionOffset.multiply(0.08));
        
        // Streak velocity opposite to rocket movement with some randomness
        const streakVel = velocity.multiply(-0.3 + Math.random() * 0.2);
        
        this.velocityStreaks.push({
          pos: streakPos,
          vel: streakVel,
          life: 0.5 + Math.random() * 0.5, // 0.5-1.0 seconds
          intensity: effectIntensity
        });
      }
    }
    
    // Update existing streaks
    for (let i = this.velocityStreaks.length - 1; i >= 0; i--) {
      const streak = this.velocityStreaks[i];
      streak.pos = streak.pos.add(streak.vel.multiply(deltaTime));
      streak.life -= deltaTime;
      
      if (streak.life <= 0) {
        this.velocityStreaks.splice(i, 1);
      }
    }
    
    // Create smoke particles with progressive dissipation based on fuel and altitude
    if (this.gameState.rocket.isEngineIgnited && this.gameState.rocket.throttle > 0) {
      // Get current stage fuel information
      const currentStage = this.gameState.rocket.stages[this.gameState.rocket.currentStage];
      const hasFuel = currentStage && currentStage.fuelRemaining > 0;
      
      // Progressive smoke reduction based on altitude and fuel
      let smokeIntensity = 1.0;
      
      // Altitude-based reduction (progressive from 5km to 45km)
      if (altitude > 5000) {
        const altitudeRatio = Math.min(1, (altitude - 5000) / (45000 - 5000)); // 0 at 5km, 1 at 45km
        smokeIntensity *= (1 - altitudeRatio * 0.95); // Reduce to 5% at 45km
      }
      
      // Complete cutoff above 45km OR no fuel
      if (altitude >= 45000 || !hasFuel) {
        smokeIntensity = 0;
      }
      
      // Only create smoke if there's intensity
      if (smokeIntensity > 0.02) {
        // Create smoke particles from engine exhaust
        // Reduced frequency for performance
        const smokeFrequency = Math.max(1, Math.floor(6 * this.gameState.rocket.throttle * smokeIntensity));
      
      for (let i = 0; i < smokeFrequency; i++) {
        // Position smoke within the exhaust plume (about halfway down)
        const distAlong = halfPlume + 6 + (Math.random() - 0.5) * 8;
        const down = rocketDown.multiply(distAlong);
        const jitter = new Vector2((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
        const smokePos = new Vector2(engineBase.x + down.x + jitter.x, engineBase.y + down.y + jitter.y);
        
        // Smoke starts along the nozzle direction, then gets affected by atmosphere
        const ejectSpeed = 90 + 140 * this.gameState.rocket.throttle; // initial exhaust speed component
        const dir = rocketDown;
        const smokeVel = new Vector2(
          dir.x * ejectSpeed + velocity.x * 0.15 + (Math.random() - 0.5) * 12,
          dir.y * ejectSpeed + velocity.y * 0.15 + (Math.random() - 0.5) * 12
        );
        
        this.smokeParticles.push({
          pos: smokePos,
          vel: smokeVel,
          life: (2.0 + Math.random() * 2.0) * smokeIntensity, // shorter life
          maxLife: 3.0 * smokeIntensity,
          size: (4 + Math.random() * 8) * smokeIntensity // smaller
        });
      }
      
      // Limit smoke particles to prevent performance issues
      if (this.smokeParticles.length > 120) {
        this.smokeParticles.splice(0, this.smokeParticles.length - 120);
      }
      }
    }
    
    // Update existing smoke particles
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const smoke = this.smokeParticles[i];
      
      // Apply drag and buoyancy based on altitude/atmosphere
      const smokeAltitude = this.gameState.world.getAltitude(smoke.pos.magnitude());
      const atmosphereDensity = Math.max(0.1, Math.exp(-smokeAltitude / 8000)); // Exponential decay
      const drag = 0.02 * atmosphereDensity;
      
      // Apply drag
      smoke.vel = smoke.vel.multiply(1 - drag * deltaTime);
      
      // Wind effect at low altitude
      if (smokeAltitude < 2000) {
        smoke.vel.x += 5 * deltaTime; // Light wind
      }
      
      // Update position and life
      smoke.pos = smoke.pos.add(smoke.vel.multiply(deltaTime));
      smoke.life -= deltaTime;
      
      // Expand smoke over time
      smoke.size += 6 * deltaTime; // slower expansion
      
      if (smoke.life <= 0) {
        this.smokeParticles.splice(i, 1);
      }
    }
  }
  
  private drawSpeedEffects(): void {
    // Draw velocity streaks
    for (const streak of this.velocityStreaks) {
      const alpha = Math.max(0, streak.life) * streak.intensity;
      const size = 2 + streak.intensity * 3;
      
      // Color based on intensity - blue for low speed, orange/red for high speed
      let color;
      if (streak.intensity < 0.3) {
        color = `rgba(135, 206, 235, ${alpha})`; // Light blue
      } else if (streak.intensity < 0.6) {
        color = `rgba(255, 165, 0, ${alpha})`; // Orange
      } else {
        color = `rgba(255, 69, 0, ${alpha})`; // Red-orange
      }
      
      this.renderer.drawCircle(streak.pos, size, color, color);
    }
    
    // Draw atmospheric heating glow around rocket
    if (this.atmosphericGlow > 0.2) {
      const rocketPos = this.gameState.rocket.position;
      const glowRadius = 15 + this.atmosphericGlow * 25;
      const alpha = this.atmosphericGlow * 0.3;
      
      // Multiple glow layers for better effect
      for (let i = 3; i >= 1; i--) {
        const layerRadius = glowRadius * (i / 3);
        const layerAlpha = alpha / i;
        
        let glowColor;
        if (this.atmosphericGlow < 0.4) {
          glowColor = `rgba(135, 206, 235, ${layerAlpha})`; // Blue
        } else if (this.atmosphericGlow < 0.7) {
          glowColor = `rgba(255, 165, 0, ${layerAlpha})`; // Orange
        } else {
          glowColor = `rgba(255, 69, 0, ${layerAlpha})`; // Red
        }
        
        this.renderer.drawCircle(rocketPos, layerRadius, 'transparent', glowColor);
      }
    }
    
    // Draw smoke particles
    for (const smoke of this.smokeParticles) {
      const alpha = Math.max(0, smoke.life / smoke.maxLife) * 0.6; // Fade out over time
      const color = `rgba(200, 200, 200, ${alpha})`; // Gray smoke
      
      // Draw smoke as filled circles that expand over time
      this.renderer.drawCircle(smoke.pos, smoke.size, color, color);
    }
  }

  // === ATMOSPHERE NOTIFICATION METHODS ===
  
  private checkAtmosphereLayers(): void {
    const altitude = this.gameState.world.getAltitude(this.gameState.rocket.position.magnitude());
    let currentLayer = -1;
    
    // Define atmosphere layers - Real Earth altitudes
    if (altitude < 11000) {
      currentLayer = 0; // Troposphere (0-11km)
    } else if (altitude < 50000) {
      currentLayer = 1; // Stratosphere (11-50km)
    } else if (altitude < 80000) {
      currentLayer = 2; // Mesosphere (50-80km)
    } else if (altitude < 700000) {
      currentLayer = 3; // Thermosphere (80-700km)
    } else {
      currentLayer = 4; // Exosphere / Space (>700km)
    }
    
    // Check if we've entered a new layer
    if (currentLayer > this.lastAtmosphereLayer && currentLayer >= 0) {
      let message = '';
      switch (currentLayer) {
        case 0:
          message = 'You reached the Troposphere!';
          break;
        case 1:
          message = 'You reached the Stratosphere!';
          break;
        case 2:
          message = 'You reached the Mesosphere!';
          break;
        case 3:
          message = 'You reached the Thermosphere!';
          break;
        case 4:
          message = 'You reached the Exosphere! (Near-space)';
          break;
      }
      
      if (message) {
        this.atmosphereMessages.push({
          text: message,
          time: this.gameState.currentTime,
          duration: 3.0
        });
      }
      
      this.lastAtmosphereLayer = currentLayer;
    }
  }
  
  private updateAtmosphereMessages(deltaTime: number): void {
    for (let i = this.atmosphereMessages.length - 1; i >= 0; i--) {
      const msg = this.atmosphereMessages[i];
      if (this.gameState.currentTime - msg.time > msg.duration) {
        this.atmosphereMessages.splice(i, 1);
      }
    }
  }

  /**
   * Create an explosion at the rocket's current position
   */
  private createExplosion(position: Vector2, velocity: Vector2): void {
    const particleCount = 15;
    const particles = [];
    
    // Create cartoonish explosion particles
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
      const speed = 100 + Math.random() * 150;
      const particleVel = new Vector2(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed
      ).add(velocity.multiply(0.3)); // Inherit some velocity from rocket
      
      const colors = ['#ff4500', '#ff8c00', '#ffff00', '#ff6347', '#ffa500'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      particles.push({
        pos: position.clone(),
        vel: particleVel,
        color: color,
        size: 2 + Math.random() * 4
      });
    }
    
    this.explosions.push({
      pos: position.clone(),
      vel: velocity.multiply(0.1), // Explosion center drifts with rocket momentum
      life: 0,
      maxLife: 2.0, // 2 second explosion
      size: 30 + Math.random() * 20,
      particles: particles
    });
    // Explosion SFX
    this.sfx?.explosion.play(SoundPaths.explosion, 0.9).catch(()=>{});
    
    console.log('💥 BOOM! Explosion created at staging location!');
  }

  /**
   * Update all active explosions
   */
  private updateExplosions(deltaTime: number): void {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const explosion = this.explosions[i];
      explosion.life += deltaTime;
      
      // Update explosion center position
      explosion.pos = explosion.pos.add(explosion.vel.multiply(deltaTime));
      
      // Update each particle
      for (const particle of explosion.particles) {
        particle.pos = particle.pos.add(particle.vel.multiply(deltaTime));
        // Simple gravity effect on particles
        particle.vel.y -= 20 * deltaTime; // Slight downward acceleration
        // Air resistance effect
        particle.vel = particle.vel.multiply(0.98);
      }
      
      // Remove expired explosions
      if (explosion.life >= explosion.maxLife) {
        this.explosions.splice(i, 1);
      }
    }
  }

  /**
   * Draw all active explosions with cartoonish style
   */
  private drawExplosions(): void {
    for (const explosion of this.explosions) {
      const ageRatio = explosion.life / explosion.maxLife;
      const alpha = Math.max(0, 1 - ageRatio * 1.5); // Fade out
      
      // Draw explosion particles
      for (const particle of explosion.particles) {
        const particleAlpha = alpha * (0.7 + Math.random() * 0.3);
        const color = particle.color + Math.floor(particleAlpha * 255).toString(16).padStart(2, '0');
        
        this.renderer.drawCircle(
          particle.pos,
          particle.size * (1 + ageRatio * 0.5), // Grow slightly over time
          color
        );
      }
      
      // Draw main explosion flash (bright center)
      if (ageRatio < 0.3) {
        const flashAlpha = Math.max(0, (0.3 - ageRatio) * 3);
        const flashSize = explosion.size * (1 + ageRatio * 2);
        const flashColor = `rgba(255, 255, 200, ${flashAlpha})`;
        
        this.renderer.drawCircle(explosion.pos, flashSize, flashColor);
      }
    }
  }
  
  private drawAtmosphereMessages(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Screen coordinates

    const centerX = this.canvas.width / 2;
    let offsetY = 90;
    
    for (const msg of this.atmosphereMessages) {
      const age = this.gameState.currentTime - msg.time;
      const fadeIn = Math.min(1, age * 3); // Fade in over 0.33s
      const fadeOut = Math.min(1, Math.max(0, (msg.duration - age) * 2)); // Fade out over 0.5s
      const alpha = fadeIn * fadeOut;

      // Font first, then measure
      ctx.font = '14px monospace';
      ctx.textAlign = 'left';
      const maxTextWidth = Math.min(this.canvas.width * 0.6, 380);
      const lines = this.wrapText(ctx, msg.text, maxTextWidth);
      const lineHeight = 18;
      let textW = 0;
      for (const line of lines) {
        textW = Math.max(textW, ctx.measureText(line).width);
      }
      const padX = 12, padY = 8;
      const panelW = textW + padX * 2;
      const panelH = lines.length * lineHeight + padY * 2;
      const panelX = centerX - panelW / 2;
      const panelY = offsetY;

      // Background panel
      ctx.fillStyle = `rgba(0, 50, 100, ${alpha * 0.8})`;
      ctx.fillRect(panelX, panelY, panelW, panelH);

      // Border
      ctx.strokeStyle = `rgba(100, 150, 255, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(panelX, panelY, panelW, panelH);

      // Text
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      let ty = panelY + padY + 13;
      for (const line of lines) {
        ctx.fillText(line, panelX + padX, ty);
        ty += lineHeight;
      }

      offsetY += panelH + 8;
    }
    
    ctx.restore();
  }
  
  /**
   * Destroy rocket completely - triggers explosion phase first
   */
  private destroyRocket(reason?: string): void {
    this.explosionPhase = true;
    this.explosionTimer = 0;
    if (reason) this.gameOverReason = reason;
    
    // Cut engines and stop physics
    this.gameState.rocket.isEngineIgnited = false;
    this.gameState.rocket.throttle = 0;
    this.sound?.stopEngine();
    
    // Create debris particles from rocket destruction
    const rocketPos = this.gameState.rocket.position;
    const rocketVel = this.gameState.rocket.velocity;
    
    for (let i = 0; i < 20; i++) {
      const debris = {
        pos: rocketPos.add(new Vector2(
          (Math.random() - 0.5) * 50,
          (Math.random() - 0.5) * 50
        )),
        vel: rocketVel.add(new Vector2(
          (Math.random() - 0.5) * 100,
          (Math.random() - 0.5) * 100
        )),
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 10,
        life: 3.0 + Math.random() * 2.0
      };
      this.stagingDebris.push(debris);
    }
    
    console.log('🚀💥 ROCKET DESTROYED! Explosion in progress...');
  }
  
  /**
   * Render game over screen
   */
  private renderGameOverScreen(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    
    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Game over text
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MISSION FAILED', this.canvas.width / 2, this.canvas.height / 2 - 40);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px monospace';
    const reason = this.gameOverReason || 'Vehicle destroyed';
    ctx.fillText(reason, this.canvas.width / 2, this.canvas.height / 2 + 20);
    
    // Countdown
    const timeLeft = Math.ceil(5.0 - this.gameOverTimer);
    if (timeLeft > 0) {
      ctx.font = '20px monospace';
      ctx.fillText(`Restarting in ${timeLeft}...`, this.canvas.width / 2, this.canvas.height / 2 + 60);
    }
    
    ctx.textAlign = 'left'; // Reset
  }
  
}

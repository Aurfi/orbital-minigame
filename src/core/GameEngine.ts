import { Vector2 } from '../physics/Vector2.js';
import { RigidBody } from '../physics/RigidBody.js';
import { WorldParameters } from '../physics/WorldParameters.js';
import { AtmosphericPhysics } from '../physics/AtmosphericPhysics.js';
import { PhysicsIntegrator } from '../physics/PhysicsIntegrator.js';
import { CanvasRenderer, Camera } from '../rendering/CanvasRenderer.js';
import { RocketRenderer } from '../rendering/RocketRenderer.js';
import { HUDSystem } from '../ui/HUDSystem.js';
import { RocketConfiguration } from './RocketConfiguration.js';
import type { GameState } from './types.js';

// Main game engine class
export class GameEngine {
  private canvas: HTMLCanvasElement;
  private renderer: CanvasRenderer;
  private camera: Camera;
  private hudSystem: HUDSystem;
  private rocketRenderer: RocketRenderer;
  private physicsIntegrator: PhysicsIntegrator;

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
  private separatedStages: Array<{pos: Vector2, vel: Vector2, rotation: number, rotSpeed: number, life: number, stageIndex: number}> = [];
  private smokeParticles: Array<{pos: Vector2, vel: Vector2, life: number, maxLife: number, size: number}> = [];
  private explosions: Array<{pos: Vector2, vel: Vector2, life: number, maxLife: number, size: number, particles: Array<{pos: Vector2, vel: Vector2, color: string, size: number}>}> = [];
  private stagingAnimationTime = 0;
  private lastStagingTime = 0;
  
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
  
  // Game speed controls
  private gameSpeed = 1; // 1x, 2x, 3x speed multiplier
  
  /**
   * Safe Vector2 normalize utility to avoid normalize errors
   */
  private safeNormalize(vector: Vector2): Vector2 {
    const magnitude = vector.magnitude();
    if (magnitude < 0.001) {
      return new Vector2(0, -1); // Default direction
    }
    try {
      if (typeof vector.normalize === 'function') {
        return vector.normalize();
      } else if (typeof vector.normalized === 'function') {
        return vector.normalized();
      } else {
        // Manual normalize
        return new Vector2(vector.x / magnitude, vector.y / magnitude);
      }
    } catch (error) {
      return new Vector2(0, -1); // Fallback direction
    }
  }
  
  // Speed effects
  private velocityStreaks: Array<{pos: Vector2, vel: Vector2, life: number, intensity: number}> = [];
  private atmosphericGlow = 0; // Heating effect intensity

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new CanvasRenderer(canvas);
    // Initialize camera - will be set properly in initializeGameState
    this.camera = new Camera(Vector2.zero(), 0.1);
    this.hudSystem = new HUDSystem(canvas);
    this.rocketRenderer = new RocketRenderer();
    this.physicsIntegrator = new PhysicsIntegrator();

    this.renderer.setCamera(this.camera);

    // Initialize game state first
    this.initializeGameState();
    
    // Setup camera to proper initial position and zoom
    this.camera.setTarget(this.gameState.rocket.position);
    this.camera.position = this.gameState.rocket.position.clone();
    this.camera.setZoom(0.5); // Start very zoomed in for detailed rocket view
    
    // Initialize timer and show welcome message
    this.gameStartTime = Date.now();
    this.missionTimer = 0;
    this.atmosphereMessages.push({
      text: 'New Game Started - Good Luck!',
      time: 0,
      duration: 3.0
    });
    
    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Initialize the game state with default values
   */
  private initializeGameState(): void {
    this.rocketConfig = RocketConfiguration.createTutorialRocket();

    // Create world first
    const world = new WorldParameters();
    
    // Start rocket on launch pad - right on the surface
    const launchPosition = new Vector2(0, world.planetRadius + 10); // 10m above surface (barely off ground)
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
        currentStage: 0,
        stages: this.rocketConfig.stages,
      },
    };
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
    switch (event.code) {
      case 'Space':
        event.preventDefault();
        if (!this.gameState.rocket.isEngineIgnited) {
          this.igniteEngines();
        }
        break;
      case 'KeyZ':
        this.setThrottle(1.0);
        break;
      case 'KeyX':
        this.setThrottle(0.0);
        break;
      case 'KeyC':
        this.cutEngines();
        break;
      case 'KeyS':
        this.performStaging();
        break;
      case 'KeyP':
        this.togglePause();
        break;
      case 'KeyR':
        this.restart();
        break;
    }
  }

  /**
   * Handle key up events
   * @param _event Keyboard event
   */
  private handleKeyUp(_event: KeyboardEvent): void {
    // Handle key releases if needed
  }

  /**
   * Handle mouse clicks on canvas for UI interactions
   */
  private handleCanvasClick(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Check for restart button click (stored in HUDSystem)
    const hudSystem = this.hudSystem as any;
    if (hudSystem.restartButtonBounds) {
      const button = hudSystem.restartButtonBounds;
      if (x >= button.x && x <= button.x + button.width && 
          y >= button.y && y <= button.y + button.height) {
        this.restart();
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
    this.gameLoop();

    console.log('Game started');
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
    
    // Reset game over and explosion states
    this.isGameOver = false;
    this.gameOverTimer = 0;
    this.explosionPhase = false;
    this.explosionTimer = 0;
    
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
    
    // Reinitialize game state
    this.initializeGameState();
    this.gameStartTime = Date.now();
    this.missionTimer = 0;
    
    // Start the game
    this.start();
    
    console.log('✅ Game restarted successfully!');
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
        this.restart();
      }
      // Update explosions and particles even when game over
      this.updateExplosions(deltaTime);
      return;
    }
    
    this.gameState.currentTime += deltaTime;
    this.missionTimer = (Date.now() - this.gameStartTime) / 1000; // Convert to seconds

    // Update physics
    this.physicsIntegrator.update(deltaTime, (dt) => {
      this.updatePhysics(dt);
    });

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

    // Update rocket state from physics
    this.updateRocketState();

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
        const targetZoom = 0.5; // Maintain detailed view
        this.camera.setZoom(targetZoom);
      }
    }
  }

  /**
   * Update physics simulation
   * @param deltaTime Physics timestep
   */
  private updatePhysics(deltaTime: number): void {
    // If rocket has never been launched, keep it fixed to launch pad
    if (!this.gameState.rocket.hasEverLaunched) {
      // Fix rocket to launch pad position
      const launchPosition = new Vector2(0, this.gameState.world.planetRadius + 10);
      this.rocketBody.position = launchPosition;
      this.rocketBody.velocity = Vector2.zero();
      return; // Skip all physics until first ignition
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
      }
    }

    // Apply atmospheric drag
    const altitude = this.gameState.world.getAltitude(this.rocketBody.position.magnitude());
    if (altitude < 100_000) {
      // Only apply drag in atmosphere
      const dragForce = this.calculateDragForce();
      this.rocketBody.applyForce(dragForce);
    }

    // Update rocket mass
    this.rocketBody.setMass(this.rocketConfig.getCurrentMass());

    // Integrate physics
    this.rocketBody.integrate(deltaTime);

    // Check for ground collision - only after engines have been ignited
    if (this.gameState.rocket.isEngineIgnited && this.gameState.world.isBelowSurface(this.rocketBody.position.magnitude())) {
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
    // Simple: 0 rotation = straight up (0, 1)
    const direction = new Vector2(0, 1); // Always point up for now
    // console.log(`Raw thrust: ${this.rocketConfig.getCurrentThrust()}N, throttle: ${this.gameState.rocket.throttle}, direction: (${direction.x}, ${direction.y})`);

    return direction.multiply(thrust);
  }

  /**
   * Calculate atmospheric drag force
   * @returns Drag force vector
   */
  private calculateDragForce(): Vector2 {
    const altitude = this.gameState.world.getAltitude(this.rocketBody.position.magnitude());
    const density = this.gameState.world.getAtmosphericDensity(altitude);

    return AtmosphericPhysics.calculateDragForce(
      this.rocketBody.velocity,
      density,
      this.rocketConfig.dragCoefficient,
      this.rocketConfig.crossSectionalArea
    );
  }

  /**
   * Update rocket state from physics body
   */
  private updateRocketState(): void {
    this.gameState.rocket.position = this.rocketBody.position.clone();
    this.gameState.rocket.velocity = this.rocketBody.velocity.clone();
    this.gameState.rocket.rotation = this.rocketBody.rotation;
    this.gameState.rocket.mass = this.rocketBody.mass;
    this.gameState.rocket.stages = this.rocketConfig.stages;
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
    
    // Check if impact speed is above 15 m/s - if so, explode
    const impactSpeed = this.rocketBody.velocity.magnitude();
    if (impactSpeed > 15.0) {
      console.log(`💥 HIGH-SPEED GROUND IMPACT! Speed: ${impactSpeed.toFixed(1)} m/s - EXPLOSION!`);
      
      // Create explosion at impact site
      this.createExplosion(this.gameState.rocket.position, this.gameState.rocket.velocity);
      
      // Destroy rocket completely - game over
      this.destroyRocket();
      return;
    }
    
    // Soft landing - stop the rocket at current position
    console.log(`Soft landing! Impact speed: ${impactSpeed.toFixed(1)} m/s`);
    this.rocketBody.velocity = Vector2.zero();
    
    // Only adjust position if rocket is actually underground
    const currentDistance = this.rocketBody.position.magnitude();
    const surfaceDistance = this.gameState.world.planetRadius;
    
    if (currentDistance < surfaceDistance) {
      // Only move to surface if actually underground
      const normalizedPos = this.safeNormalize(this.rocketBody.position);
      this.rocketBody.position = normalizedPos.multiply(surfaceDistance + 1); // Just above surface
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
    this.drawBackgroundElements();

    // Draw rocket (only if not exploding or game over)
    if (!this.explosionPhase && !this.isGameOver) {
      this.rocketRenderer.render(this.renderer, this.gameState.rocket);
    }

    this.renderer.endFrame();

    // Draw HUD
    this.hudSystem.render(this.renderer, this.gameState, this.missionTimer);
    
    // Draw atmosphere messages on top of HUD
    this.drawAtmosphereMessages();
    
    // Draw game over screen if needed
    if (this.isGameOver) {
      this.renderGameOverScreen();
    }
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
    // Calculate sky color based on altitude
    let skyColor: string;
    
    if (altitude < 5_000) {
      // Low altitude - light blue sky
      skyColor = '#87CEEB'; // Sky blue
    } else if (altitude < 20_000) {
      // Medium altitude - transitioning to darker blue
      const factor = (altitude - 5_000) / 15_000;
      const r = Math.floor(135 * (1 - factor) + 70 * factor);
      const g = Math.floor(206 * (1 - factor) + 130 * factor);
      const b = Math.floor(235 * (1 - factor) + 180 * factor);
      skyColor = `rgb(${r}, ${g}, ${b})`;
    } else if (altitude < 50_000) {
      // High altitude - dark blue
      const factor = (altitude - 20_000) / 30_000;
      const r = Math.floor(70 * (1 - factor) + 25 * factor);
      const g = Math.floor(130 * (1 - factor) + 25 * factor);
      const b = Math.floor(180 * (1 - factor) + 50 * factor);
      skyColor = `rgb(${r}, ${g}, ${b})`;
    } else {
      // Space - almost black with slight blue tint
      skyColor = '#0F0F23'; // Very dark blue
    }

    // Fill entire background with sky color
    this.renderer.clear(skyColor);
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
    if (altitude > 10000) {
      this.drawMoon();
    }
    if (altitude > 50000) {
      this.drawStars();
    }
    
    // Draw buildings at low altitude
    if (altitude < 20000) {
      this.drawBuildings();
    }
    
    // Draw clouds at medium altitude
    if (altitude < 15000) {
      this.drawClouds();
    }
    
    // Draw flying objects
    if (altitude < 25000) {
      this.drawBirds();
      this.drawPlanes();
    }
    
    // Draw staging debris
    this.drawStagingDebris();
    
    // Draw explosions
    this.drawExplosions();
    
    // Draw speed effects
    this.drawSpeedEffects();
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
  private drawBuildings(): void {
    const groundLevel = this.gameState.world.planetRadius + 10;
    
    // Vehicle Assembly Building (VAB) - realistic proportions
    this.renderer.drawRectangle(
      new Vector2(-400, groundLevel),
      160, 220, '#f0f0f0', '#333333', 2
    );
    // VAB blue stripes
    this.renderer.drawRectangle(new Vector2(-360, groundLevel + 20), 8, 180, '#1f4788');
    this.renderer.drawRectangle(new Vector2(-340, groundLevel + 20), 8, 180, '#1f4788');
    this.renderer.drawRectangle(new Vector2(-380, groundLevel + 20), 8, 180, '#1f4788');
    
    // Launch Control Center
    this.renderer.drawRectangle(
      new Vector2(-200, groundLevel),
      80, 60, '#e0e0e0', '#333333', 2
    );
    
    // Service Tower
    this.renderer.drawRectangle(
      new Vector2(100, groundLevel),
      15, 150, '#c0c0c0', '#333333', 2
    );
    
    // Multiple hangars
    this.renderer.drawRectangle(new Vector2(-600, groundLevel), 100, 40, '#d5d5d5', '#333333', 1);
    this.renderer.drawRectangle(new Vector2(300, groundLevel), 80, 35, '#d5d5d5', '#333333', 1);
    this.renderer.drawRectangle(new Vector2(450, groundLevel), 60, 30, '#d5d5d5', '#333333', 1);
    
    // Crawler transporter path
    this.renderer.drawRectangle(new Vector2(-300, groundLevel - 2), 400, 8, '#555555');
  }

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
      console.log('✅ Engines ignited! Auto-throttle set to 50%');
      return true;
    }
    console.log('❌ No thrust available - ignition failed');
    return false;
  }

  setThrottle(value: number): void {
    this.gameState.rocket.throttle = Math.max(0, Math.min(1, value));
    console.log(`Throttle set to ${(this.gameState.rocket.throttle * 100).toFixed(0)}%`);
  }

  cutEngines(): void {
    this.gameState.rocket.isEngineIgnited = false;
    this.gameState.rocket.throttle = 0;
    console.log('🔥 Engines cut! Complete engine shutdown.');
  }

  performStaging(): boolean {
    const currentThrust = this.rocketConfig.getCurrentThrust() * this.gameState.rocket.throttle;

    // Check if this would cause explosion (engines on)
    if (this.rocketConfig.wouldExplodeOnStaging(currentThrust)) {
      console.log('💥 EXPLOSION! Cannot stage with engines firing - catastrophic failure!');
      
      // Create explosion at rocket position
      this.createExplosion(this.gameState.rocket.position, this.gameState.rocket.velocity);
      
      // Destroy rocket completely - game over
      this.destroyRocket();
      
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
    
    // Create more realistic separation - small push away from rocket
    const separationSpeed = 2.0 + Math.random() * 1.0; // 2-3 m/s separation
    const rocketDirection = this.safeNormalize(velocity);
    const separationDirection = new Vector2(-rocketDirection.x, -rocketDirection.y); // Opposite to rocket direction
    
    const separationVel = velocity.add(separationDirection.multiply(separationSpeed));
    
    // Calculate proper stage bottom position based on rocket geometry
    let stageBottomOffset = 0;
    if (currentStageIndex === 0) {
      // First stage - position at bottom of rocket
      stageBottomOffset = 25; // Bottom of first stage
    } else if (currentStageIndex === 1) {
      // Second stage - position where first stage was
      stageBottomOffset = 15; // Smaller second stage
    }
    
    // Position separated stage at bottom of rocket with proper offset
    const separatedStagePos = new Vector2(
      position.x + Math.sin(this.gameState.rocket.rotation) * stageBottomOffset,
      position.y - Math.cos(this.gameState.rocket.rotation) * stageBottomOffset
    );
    
    this.separatedStages.push({
      pos: separatedStagePos,
      vel: separationVel,
      rotation: this.gameState.rocket.rotation + (Math.random() - 0.5) * 0.2, // Slight initial rotation offset
      rotSpeed: (Math.random() - 0.5) * 1.5, // More visible rotation
      life: 30.0, // Visible for 30 seconds - longer visibility
      stageIndex: Math.max(0, currentStageIndex)
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
      
      // Apply physics to separated stages (gravity, etc.)
      let stagePosition: Vector2;
      if (stage.pos instanceof Vector2) {
        stagePosition = stage.pos;
      } else {
        stagePosition = new Vector2(stage.pos.x || 0, stage.pos.y || 0);
      }
      
      const gravityMagnitude = this.gameState.world.getGravitationalAcceleration(stagePosition.magnitude());
      
      // Safely normalize position (avoid divide by zero and method errors)
      const positionMagnitude = stagePosition.magnitude();
      let gravityDirection: Vector2;
      
      gravityDirection = this.safeNormalize(stagePosition).multiply(-1);
      
      const gravityAccel = gravityDirection.multiply(gravityMagnitude);
      
      // Ensure velocity is a Vector2
      if (!(stage.vel instanceof Vector2)) {
        stage.vel = new Vector2(stage.vel.x, stage.vel.y);
      }
      stage.vel = stage.vel.add(gravityAccel.multiply(deltaTime));
      
      // Ensure position is a Vector2 and update
      if (!(stage.pos instanceof Vector2)) {
        stage.pos = new Vector2(stage.pos.x, stage.pos.y);
      }
      stage.pos = stage.pos.add(stage.vel.multiply(deltaTime));
      stage.rotation += stage.rotSpeed * deltaTime;
      stage.life -= deltaTime;
      
      if (stage.life <= 0) {
        this.separatedStages.splice(i, 1);
      }
    }
  }
  
  private drawStagingDebris(): void {
    // Draw separated stages
    for (const stage of this.separatedStages) {
      const alpha = Math.max(0, Math.min(1, stage.life / 30.0)); // Fade out over 30 seconds
      
      this.renderer.drawRotated(stage.pos, stage.rotation, () => {
        // Draw different stage types based on stage index
        if (stage.stageIndex === 0) {
          // First stage - large booster
          this.renderer.drawRectangle(
            new Vector2(-8, -25),
            16, 50,
            `rgba(240, 240, 240, ${alpha})`, // Light gray body
            `rgba(44, 90, 160, ${alpha})`, // NASA blue outline
            2
          );
          
          // Engine nozzles for first stage
          this.renderer.drawRectangle(
            new Vector2(-6, 20),
            4, 8,
            `rgba(100, 100, 100, ${alpha})`,
            `rgba(60, 60, 60, ${alpha})`,
            1
          );
          this.renderer.drawRectangle(
            new Vector2(2, 20),
            4, 8,
            `rgba(100, 100, 100, ${alpha})`,
            `rgba(60, 60, 60, ${alpha})`,
            1
          );
          
          // First stage details (fuel lines, etc.)
          this.renderer.drawRectangle(
            new Vector2(-7, -10),
            2, 20,
            `rgba(44, 90, 160, ${alpha})`, // Blue stripe
            undefined,
            0
          );
          this.renderer.drawRectangle(
            new Vector2(5, -10),
            2, 20,
            `rgba(44, 90, 160, ${alpha})`, // Blue stripe
            undefined,
            0
          );
        } else {
          // Second stage - smaller
          this.renderer.drawRectangle(
            new Vector2(-6, -18),
            12, 36,
            `rgba(255, 255, 255, ${alpha})`, // White body
            `rgba(192, 57, 43, ${alpha})`, // Red outline
            2
          );
          
          // Single engine nozzle for second stage
          this.renderer.drawRectangle(
            new Vector2(-3, 15),
            6, 6,
            `rgba(100, 100, 100, ${alpha})`,
            `rgba(60, 60, 60, ${alpha})`,
            1
          );
          
          // Second stage red band
          this.renderer.drawRectangle(
            new Vector2(-6, -5),
            12, 4,
            `rgba(192, 57, 43, ${alpha})`, // Red band
            undefined,
            0
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
    
    
    // Create velocity streaks if moving fast enough in atmosphere
    if (effectIntensity > 0.01) { // Much lower threshold
      const streakCount = Math.floor(effectIntensity * 8); // 0-8 streaks
      
      for (let i = 0; i < streakCount; i++) {
        // Create streaks where air friction occurs - opposite to velocity direction
        const velocityAngle = Math.atan2(velocity.x, velocity.y);
        const rocketRotation = this.gameState.rocket.rotation;
        
        // Distance from rocket center to air friction point
        const frictionDistance = 30 + Math.random() * 20;
        
        // Position streaks opposite to velocity direction (where air hits the rocket)
        const velocityOppositeAngle = velocityAngle + Math.PI; // 180 degrees opposite
        
        // Add some randomness around the velocity-opposite direction
        const spreadAngle = (Math.random() - 0.5) * 0.8; // ±23 degrees spread
        const effectiveAngle = velocityOppositeAngle + spreadAngle;
        
        // Calculate position where air friction creates the visual effect
        const frictionOffset = new Vector2(
          Math.sin(effectiveAngle) * frictionDistance,
          -Math.cos(effectiveAngle) * frictionDistance
        );
        
        const streakPos = position.add(frictionOffset);
        
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
      if (smokeIntensity > 0.01) {
        // Create smoke particles from engine exhaust
        const smokeFrequency = Math.max(1, Math.floor(10 * this.gameState.rocket.throttle * smokeIntensity)); // More smoke at higher throttle, reduced by intensity
      
      for (let i = 0; i < smokeFrequency; i++) {
        // Position smoke at rocket bottom (engine exit)
        const smokeOffset = 25 + Math.random() * 10; // Bottom of rocket + some variance
        const smokePos = new Vector2(
          position.x + Math.sin(this.gameState.rocket.rotation) * smokeOffset + (Math.random() - 0.5) * 10,
          position.y - Math.cos(this.gameState.rocket.rotation) * smokeOffset + (Math.random() - 0.5) * 10
        );
        
        // Smoke starts with exhaust velocity then gets affected by atmosphere
        const smokeVel = new Vector2(
          velocity.x * 0.3 + (Math.random() - 0.5) * 50, // Some of rocket velocity + random spread
          velocity.y * 0.3 + (Math.random() - 0.5) * 50 - 20 // Upward bias from hot exhaust
        );
        
        this.smokeParticles.push({
          pos: smokePos,
          vel: smokeVel,
          life: (2 + Math.random() * 3) * smokeIntensity, // Shorter life at high altitude
          maxLife: 3 * smokeIntensity,
          size: (5 + Math.random() * 10) * smokeIntensity // Smaller size at high altitude
        });
      }
      
      // Limit smoke particles to prevent performance issues
      if (this.smokeParticles.length > 200) {
        this.smokeParticles.splice(0, this.smokeParticles.length - 200);
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
      smoke.size += 10 * deltaTime;
      
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
      currentLayer = 4; // Space (>700km)
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
          message = 'You reached Space! (<0.5% atmosphere)';
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
    let offsetY = 100;
    
    for (const msg of this.atmosphereMessages) {
      const age = this.gameState.currentTime - msg.time;
      const fadeIn = Math.min(1, age * 3); // Fade in over 0.33s
      const fadeOut = Math.min(1, Math.max(0, (msg.duration - age) * 2)); // Fade out over 0.5s
      const alpha = fadeIn * fadeOut;
      
      // Background panel
      ctx.fillStyle = `rgba(0, 50, 100, ${alpha * 0.8})`;
      const textWidth = ctx.measureText(msg.text).width || 300;
      ctx.fillRect(centerX - textWidth/2 - 20, offsetY - 25, textWidth + 40, 40);
      
      // Border
      ctx.strokeStyle = `rgba(100, 150, 255, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(centerX - textWidth/2 - 20, offsetY - 25, textWidth + 40, 40);
      
      // Text
      ctx.font = '18px Arial';
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillText(msg.text, centerX, offsetY);
      
      offsetY += 50;
    }
    
    ctx.restore();
  }
  
  /**
   * Destroy rocket completely - triggers explosion phase first
   */
  private destroyRocket(): void {
    this.explosionPhase = true;
    this.explosionTimer = 0;
    
    // Cut engines and stop physics
    this.gameState.rocket.isEngineIgnited = false;
    this.gameState.rocket.throttle = 0;
    
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
    ctx.fillText('Rocket destroyed in staging explosion!', this.canvas.width / 2, this.canvas.height / 2 + 20);
    
    // Countdown
    const timeLeft = Math.ceil(5.0 - this.gameOverTimer);
    if (timeLeft > 0) {
      ctx.font = '20px monospace';
      ctx.fillText(`Restarting in ${timeLeft}...`, this.canvas.width / 2, this.canvas.height / 2 + 60);
    }
    
    ctx.textAlign = 'left'; // Reset
  }
  
}

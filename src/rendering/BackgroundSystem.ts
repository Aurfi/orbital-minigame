import { Vector2 } from '../physics/Vector2.js';
import { CanvasRenderer } from './CanvasRenderer.js';
import { GameState } from '../core/types.js';

interface CloudData {
  position: Vector2;
  size: number;
  opacity: number;
  speed: number;
}

interface MovingObject {
  position: Vector2;
  velocity: Vector2;
  type: 'bird' | 'plane' | 'deltaplane';
  scale: number;
  rotation: number;
}

interface Building {
  position: Vector2;
  width: number;
  height: number;
  type: 'tower' | 'hangar' | 'control' | 'assembly';
  color: string;
}

export class BackgroundSystem {
  private clouds: CloudData[] = [];
  private movingObjects: MovingObject[] = [];
  private buildings: Building[] = [];
  private stars: Vector2[] = [];
  private lastCloudSpawn = 0;
  private lastObjectSpawn = 0;

  constructor() {
    this.initializeBackground();
  }

  /**
   * Initialize static background elements
   */
  private initializeBackground(): void {
    // Generate stars
    for (let i = 0; i < 200; i++) {
      this.stars.push(new Vector2(
        (Math.random() - 0.5) * 10000,
        (Math.random() - 0.5) * 10000 + 8000000 // High up in space
      ));
    }

    // Create Kennedy Space Center style buildings
    this.createLaunchFacilities();

    // Initial clouds
    for (let i = 0; i < 15; i++) {
      this.spawnCloud();
    }

    // Initial moving objects
    for (let i = 0; i < 3; i++) {
      this.spawnMovingObject();
    }
  }

  /**
   * Create launch pad facilities
   */
  private createLaunchFacilities(): void {
    const planetRadius = 6371000; // Earth radius in meters
    const groundLevel = planetRadius + 10;

    // Vehicle Assembly Building (VAB) - iconic tall building - MAKE IT HUGE FOR VISIBILITY
    this.buildings.push({
      position: new Vector2(-300, groundLevel),
      width: 500,  // Much bigger
      height: 800, // Much taller
      type: 'assembly',
      color: '#ff0000'  // Bright red for visibility
    });

    // Launch Control Center - MAKE BIG AND BRIGHT
    this.buildings.push({
      position: new Vector2(-180, groundLevel),
      width: 200,  // Much bigger
      height: 200, // Much taller
      type: 'control',
      color: '#00ff00'  // Bright green for visibility
    });

    // Service Tower (next to launch pad) - MAKE BIG AND BRIGHT
    this.buildings.push({
      position: new Vector2(80, groundLevel),
      width: 100,  // Much wider
      height: 400, // Much taller
      type: 'tower',
      color: '#0000ff'  // Bright blue for visibility
    });

    // Hangar buildings
    this.buildings.push({
      position: new Vector2(-400, groundLevel),
      width: 100,
      height: 40,
      type: 'hangar',
      color: '#b8b8b8'
    });

    this.buildings.push({
      position: new Vector2(200, groundLevel),
      width: 80,
      height: 35,
      type: 'hangar',
      color: '#b8b8b8'
    });

    // Small support buildings
    for (let i = 0; i < 8; i++) {
      this.buildings.push({
        position: new Vector2(-600 + i * 150, groundLevel),
        width: 20 + Math.random() * 30,
        height: 15 + Math.random() * 25,
        type: 'control',
        color: '#d5d5d5'
      });
    }
  }

  /**
   * Update dynamic background elements
   */
  update(deltaTime: number, gameState: GameState): void {
    const currentTime = gameState.currentTime;

    // Spawn clouds periodically
    if (currentTime - this.lastCloudSpawn > 3 + Math.random() * 5) {
      this.spawnCloud();
      this.lastCloudSpawn = currentTime;
    }

    // Spawn moving objects periodically
    if (currentTime - this.lastObjectSpawn > 15 + Math.random() * 20) {
      this.spawnMovingObject();
      this.lastObjectSpawn = currentTime;
    }

    // Update clouds
    this.updateClouds(deltaTime, gameState);

    // Update moving objects
    this.updateMovingObjects(deltaTime, gameState);
  }

  /**
   * Spawn a new cloud
   */
  private spawnCloud(): void {
    const altitude = 1000 + Math.random() * 8000; // 1-9km altitude
    const planetRadius = 6371000;
    const cloudRadius = planetRadius + altitude;

    // Spawn clouds around the horizon from rocket's perspective
    const angle = Math.random() * Math.PI * 2;
    const cloudPosition = new Vector2(
      Math.cos(angle) * cloudRadius,
      Math.sin(angle) * cloudRadius
    );

    this.clouds.push({
      position: cloudPosition,
      size: 30 + Math.random() * 70,
      opacity: 0.3 + Math.random() * 0.4,
      speed: 5 + Math.random() * 15
    });

    // Limit cloud count
    if (this.clouds.length > 25) {
      this.clouds.shift();
    }
  }

  /**
   * Spawn moving objects (birds, planes, etc.)
   */
  private spawnMovingObject(): void {
    const types: ('bird' | 'plane' | 'deltaplane')[] = ['bird', 'plane', 'deltaplane'];
    const type = types[Math.floor(Math.random() * types.length)];

    let altitude: number;
    let speed: number;
    let scale: number;

    switch (type) {
      case 'bird':
        altitude = 50 + Math.random() * 1000; // Low altitude
        speed = 10 + Math.random() * 15;
        scale = 0.3 + Math.random() * 0.5;
        break;
      case 'plane':
        altitude = 5000 + Math.random() * 5000; // Cruising altitude
        speed = 150 + Math.random() * 100;
        scale = 0.8 + Math.random() * 0.4;
        break;
      case 'deltaplane':
        altitude = 200 + Math.random() * 800; // Low soaring altitude
        speed = 15 + Math.random() * 20;
        scale = 0.4 + Math.random() * 0.3;
        break;
    }

    const planetRadius = 6371000;
    const objectRadius = planetRadius + altitude;
    
    // Start from horizon and move across sky
    const startAngle = Math.random() * Math.PI * 2;
    const direction = new Vector2(Math.random() - 0.5, Math.random() - 0.5).normalized();

    this.movingObjects.push({
      position: new Vector2(
        Math.cos(startAngle) * objectRadius,
        Math.sin(startAngle) * objectRadius
      ),
      velocity: direction.multiply(speed),
      type,
      scale,
      rotation: Math.atan2(direction.x, direction.y)
    });

    // Limit object count
    if (this.movingObjects.length > 8) {
      this.movingObjects.shift();
    }
  }

  /**
   * Update cloud positions and properties
   */
  private updateClouds(deltaTime: number, gameState: GameState): void {
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const cloud = this.clouds[i];
      
      // Move clouds with wind (simple horizontal movement)
      cloud.position.x += cloud.speed * deltaTime;
      
      // Remove clouds that are too far
      const distanceFromRocket = cloud.position.subtract(gameState.rocket.position).magnitude();
      if (distanceFromRocket > 50000) {
        this.clouds.splice(i, 1);
      }
    }
  }

  /**
   * Update moving object positions
   */
  private updateMovingObjects(deltaTime: number, gameState: GameState): void {
    for (let i = this.movingObjects.length - 1; i >= 0; i--) {
      const obj = this.movingObjects[i];
      
      // Update position
      obj.position = obj.position.add(obj.velocity.multiply(deltaTime));
      
      // Remove objects that are too far
      const distanceFromRocket = obj.position.subtract(gameState.rocket.position).magnitude();
      if (distanceFromRocket > 100000) {
        this.movingObjects.splice(i, 1);
      }
    }
  }

  /**
   * Render all background elements
   */
  render(renderer: CanvasRenderer, gameState: GameState): void {
    const altitude = gameState.world.getAltitude(gameState.rocket.position.magnitude());
    console.log(`BackgroundSystem: Rendering at altitude ${altitude}m, buildings: ${this.buildings.length}, clouds: ${this.clouds.length}`);

    // Render stars (only visible at high altitude)
    if (altitude > 30000) {
      this.renderStars(renderer, altitude);
    }

    // Render moon (visible at medium-high altitude)
    if (altitude > 10000) {
      this.renderMoon(renderer, gameState);
    }

    // Render buildings (only visible at low altitude)
    if (altitude < 20000) {
      this.renderBuildings(renderer, gameState);
    }

    // Render clouds (visible at low-medium altitude)
    if (altitude < 15000) {
      this.renderClouds(renderer, gameState);
    }

    // Render moving objects
    if (altitude < 20000) {
      this.renderMovingObjects(renderer, gameState);
    }
  }

  /**
   * Render star field
   */
  private renderStars(renderer: CanvasRenderer, altitude: number): void {
    const starOpacity = Math.min(1.0, Math.max(0, (altitude - 30000) / 20000));
    
    for (const star of this.stars) {
      const size = 0.5 + Math.random() * 1.5;
      const alpha = starOpacity * (0.3 + Math.random() * 0.7);
      renderer.drawCircle(star, size, `rgba(255, 255, 255, ${alpha})`);
    }
  }

  /**
   * Render moon
   */
  private renderMoon(renderer: CanvasRenderer, gameState: GameState): void {
    // Fixed moon position relative to rocket
    const rocketPos = gameState.rocket.position;
    const moonPos = new Vector2(rocketPos.x + 15000, rocketPos.y + 25000);
    
    const moonSize = 150;
    renderer.drawCircle(moonPos, moonSize, '#f5f5dc', '#e0e0e0', 2);
    
    // Add some crater details
    renderer.drawCircle(new Vector2(moonPos.x - 30, moonPos.y - 20), 15, '#e8e8e8');
    renderer.drawCircle(new Vector2(moonPos.x + 40, moonPos.y + 30), 20, '#e8e8e8');
    renderer.drawCircle(new Vector2(moonPos.x - 10, moonPos.y + 40), 12, '#e8e8e8');
  }

  /**
   * Render launch facilities and buildings
   */
  private renderBuildings(renderer: CanvasRenderer, gameState: GameState): void {
    for (const building of this.buildings) {
      renderer.drawRectangle(
        new Vector2(building.position.x - building.width / 2, building.position.y),
        building.width,
        building.height,
        building.color,
        '#666666',
        1
      );

      // Add building details
      this.addBuildingDetails(renderer, building);
    }
  }

  /**
   * Add details to buildings
   */
  private addBuildingDetails(renderer: CanvasRenderer, building: Building): void {
    const pos = building.position;

    switch (building.type) {
      case 'assembly':
        // VAB-style vertical stripes
        for (let i = 0; i < 3; i++) {
          const stripeX = pos.x - building.width / 2 + (i + 1) * building.width / 4;
          renderer.drawRectangle(
            new Vector2(stripeX - 2, pos.y),
            4,
            building.height,
            '#2c5aa0'
          );
        }
        break;
        
      case 'control':
        // Windows
        const windowRows = Math.floor(building.height / 15);
        for (let row = 1; row < windowRows; row++) {
          for (let col = 0; col < Math.floor(building.width / 12); col++) {
            const windowX = pos.x - building.width / 2 + 6 + col * 12;
            const windowY = pos.y + row * 15;
            renderer.drawRectangle(
              new Vector2(windowX, windowY),
              3,
              8,
              '#4169e1'
            );
          }
        }
        break;
        
      case 'tower':
        // Tower framework
        renderer.drawRectangle(
          new Vector2(pos.x - 1, pos.y),
          2,
          building.height,
          '#888888'
        );
        // Cross beams
        for (let i = 1; i < building.height; i += 20) {
          renderer.drawLine(
            new Vector2(pos.x - building.width / 2, pos.y + i),
            new Vector2(pos.x + building.width / 2, pos.y + i),
            '#888888',
            1
          );
        }
        break;
    }
  }

  /**
   * Render clouds
   */
  private renderClouds(renderer: CanvasRenderer, gameState: GameState): void {
    for (const cloud of this.clouds) {
      const distanceFromRocket = cloud.position.subtract(gameState.rocket.position).magnitude();
      
      // Only render clouds within reasonable distance
      if (distanceFromRocket < 30000) {
        this.drawCloud(renderer, cloud.position, cloud.size, cloud.opacity);
      }
    }
  }

  /**
   * Draw a fluffy cloud
   */
  private drawCloud(renderer: CanvasRenderer, position: Vector2, size: number, opacity: number): void {
    const numPuffs = 4 + Math.floor(size / 20);
    
    for (let i = 0; i < numPuffs; i++) {
      const angle = (i / numPuffs) * Math.PI * 2;
      const offsetX = Math.cos(angle) * size * 0.3;
      const offsetY = Math.sin(angle) * size * 0.2;
      const puffSize = size * (0.6 + Math.random() * 0.4);
      
      const puffPos = new Vector2(position.x + offsetX, position.y + offsetY);
      renderer.drawCircle(puffPos, puffSize / 2, `rgba(255, 255, 255, ${opacity})`);
    }
  }

  /**
   * Render moving objects
   */
  private renderMovingObjects(renderer: CanvasRenderer, gameState: GameState): void {
    for (const obj of this.movingObjects) {
      const distanceFromRocket = obj.position.subtract(gameState.rocket.position).magnitude();
      
      // Only render objects within reasonable distance
      if (distanceFromRocket < 25000) {
        this.drawMovingObject(renderer, obj);
      }
    }
  }

  /**
   * Draw different types of moving objects
   */
  private drawMovingObject(renderer: CanvasRenderer, obj: MovingObject): void {
    renderer.drawRotated(obj.position, obj.rotation, () => {
      switch (obj.type) {
        case 'bird':
          this.drawBird(renderer, obj.scale);
          break;
        case 'plane':
          this.drawPlane(renderer, obj.scale);
          break;
        case 'deltaplane':
          this.drawDeltaplane(renderer, obj.scale);
          break;
      }
    });
  }

  /**
   * Draw a simple bird silhouette
   */
  private drawBird(renderer: CanvasRenderer, scale: number): void {
    const wingSpan = 8 * scale;
    const bodyLength = 4 * scale;
    
    // Body
    renderer.drawLine(
      new Vector2(0, -bodyLength / 2),
      new Vector2(0, bodyLength / 2),
      '#333333',
      2 * scale
    );
    
    // Wings (V shape)
    renderer.drawLine(
      new Vector2(0, 0),
      new Vector2(-wingSpan / 2, -wingSpan / 3),
      '#333333',
      1 * scale
    );
    renderer.drawLine(
      new Vector2(0, 0),
      new Vector2(wingSpan / 2, -wingSpan / 3),
      '#333333',
      1 * scale
    );
  }

  /**
   * Draw a simple airplane
   */
  private drawPlane(renderer: CanvasRenderer, scale: number): void {
    const fuselageLength = 20 * scale;
    const wingSpan = 18 * scale;
    
    // Fuselage
    renderer.drawRectangle(
      new Vector2(-fuselageLength / 2, -1 * scale),
      fuselageLength,
      2 * scale,
      '#c0c0c0'
    );
    
    // Wings
    renderer.drawRectangle(
      new Vector2(-3 * scale, -wingSpan / 2),
      6 * scale,
      wingSpan,
      '#a0a0a0'
    );
    
    // Tail
    renderer.drawRectangle(
      new Vector2(fuselageLength / 2 - 2 * scale, -4 * scale),
      4 * scale,
      8 * scale,
      '#a0a0a0'
    );
  }

  /**
   * Draw a deltaplane/hang glider
   */
  private drawDeltaplane(renderer: CanvasRenderer, scale: number): void {
    const wingSpan = 12 * scale;
    const wingLength = 8 * scale;
    
    // Delta wing shape
    renderer.drawLine(
      new Vector2(0, wingLength / 2),
      new Vector2(-wingSpan / 2, -wingLength / 2),
      '#ff6600',
      2 * scale
    );
    renderer.drawLine(
      new Vector2(0, wingLength / 2),
      new Vector2(wingSpan / 2, -wingLength / 2),
      '#ff6600',
      2 * scale
    );
    renderer.drawLine(
      new Vector2(-wingSpan / 2, -wingLength / 2),
      new Vector2(wingSpan / 2, -wingLength / 2),
      '#ff6600',
      2 * scale
    );
    
    // Support frame
    renderer.drawLine(
      new Vector2(0, wingLength / 2),
      new Vector2(0, -wingLength / 2),
      '#333333',
      1 * scale
    );
  }
}
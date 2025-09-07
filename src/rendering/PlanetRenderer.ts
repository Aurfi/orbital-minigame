import { Vector2 } from '../physics/Vector2.js';
import type { WorldParameters } from '../physics/WorldParameters.js';
import type { CanvasRenderer } from './CanvasRenderer.js';
import { CloudSystem } from './CloudSystem.js';
import { getPlanetTexture } from './PlanetTextureGen.js';

/**
 * Handles all planet-related rendering: texture, clouds, atmosphere, sky gradient
 */
export class PlanetRenderer {
  private planetTexture?: HTMLCanvasElement;
  private cloudSystem: CloudSystem;

  constructor() {
    this.cloudSystem = new CloudSystem();
    this.initializePlanetTexture();
  }

  private initializePlanetTexture(): void {
    try {
      this.planetTexture = getPlanetTexture(2048); // High resolution for zoom
    } catch (e) {
      console.warn('Failed to generate planet texture:', e);
    }
  }

  /**
   * Main render method - draws complete planet system
   */
  public render(
    renderer: CanvasRenderer,
    world: WorldParameters,
    currentTime: number,
    rocketPosition: Vector2,
    padBaseAngle: number
  ): void {
    const planetCenter = Vector2.zero();
    const planetRadius = world.planetRadius;
    const rocketAltitude = world.getAltitude(rocketPosition.magnitude());

    // 1. Sky gradient background (screen space)
    this.drawSkyGradient(renderer, rocketAltitude);

    // 2. Planet texture with rotation
    this.drawPlanetTexture(renderer, planetCenter, planetRadius, world, currentTime, padBaseAngle);

    // 3. Cloud layers
    this.drawClouds(renderer, planetCenter, planetRadius, world, currentTime, padBaseAngle);

    // 4. Atmosphere layers
    this.drawAtmosphere(renderer, planetCenter, planetRadius, rocketAltitude);
  }

  /**
   * Draw sky gradient that changes with altitude
   */
  private drawSkyGradient(renderer: CanvasRenderer, altitude: number): void {
    const ctx = renderer.getContext2D();
    if (!ctx) return;

    const wDev = ctx.canvas.width; // device pixels
    const hDev = ctx.canvas.height; // device pixels
    const cssW = ctx.canvas.clientWidth || wDev;
    const cssH = ctx.canvas.clientHeight || hDev;

    // Skip gradient on very small screens
    const tooSmall = cssW < 480 || cssH < 380;
    if (tooSmall) return;

    // Skip gradient completely at high altitude (>= 200 km)
    if (altitude >= 200_000) return;

    // Blend colors based on altitude
    const maxAlt = 175_000; // Start fading at 175 km
    const t = Math.min(1, altitude / maxAlt);

    // Interpolate between sky blue and space black
    const r = Math.round(135 * (1 - t));
    const g = Math.round(206 * (1 - t));
    const b = Math.round(235 * (1 - t));

    // Create vertical gradient
    const grad = ctx.createLinearGradient(0, 0, 0, hDev);
    const topColor = `rgb(${Math.round(r * 0.15)}, ${Math.round(g * 0.15)}, ${Math.round(b * 0.15)})`;
    const bottomColor = `rgb(${r}, ${g}, ${b})`;

    grad.addColorStop(0, topColor);
    grad.addColorStop(1, bottomColor);

    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, wDev, hDev);
    ctx.restore();
  }

  /**
   * Draw the planet texture with rotation
   */
  private drawPlanetTexture(
    renderer: CanvasRenderer,
    planetCenter: Vector2,
    planetRadius: number,
    world: WorldParameters,
    currentTime: number,
    padBaseAngle: number
  ): void {
    const omega = world.earthRotationRate || 0;
    const worldAng = padBaseAngle + omega * currentTime;

    if (this.planetTexture) {
      const ctx = renderer.getContext2D();
      ctx.save();

      // Create circular clipping path for smooth edges
      ctx.beginPath();
      ctx.arc(planetCenter.x, planetCenter.y, planetRadius, 0, Math.PI * 2);
      ctx.clip();

      // Draw the planet texture (clipped to circle)
      renderer.drawSprite(
        this.planetTexture,
        planetCenter,
        planetRadius * 2,
        planetRadius * 2,
        worldAng
      );

      ctx.restore();
    } else {
      // Fallback if texture fails
      renderer.drawCircle(planetCenter, planetRadius, '#0b3766', '#2d3a16', 2);
    }
  }

  /**
   * Draw cloud layers
   */
  private drawClouds(
    renderer: CanvasRenderer,
    planetCenter: Vector2,
    planetRadius: number,
    world: WorldParameters,
    currentTime: number,
    padBaseAngle: number
  ): void {
    const omega = world.earthRotationRate || 0;
    const planetRotation = padBaseAngle + omega * currentTime;

    const ctx = renderer.getContext2D();

    // Clouds are rendered in world space, same as planet
    this.cloudSystem.render(
      ctx,
      { x: planetCenter.x, y: planetCenter.y },
      planetRadius,
      currentTime,
      planetRotation
    );
  }

  /**
   * Draw atmosphere layers
   */
  private drawAtmosphere(
    renderer: CanvasRenderer,
    planetCenter: Vector2,
    planetRadius: number,
    altitude: number
  ): void {
    // Don't draw atmosphere in space (> 100km)
    if (altitude > 100_000) return;

    // Atmosphere intensity fades with altitude
    const atmosphereIntensity = Math.max(0, 1 - altitude / 100_000);

    // Draw multiple atmosphere layers
    const layers = [
      { radius: planetRadius * 1.02, alpha: 0.03 * atmosphereIntensity },
      { radius: planetRadius * 1.04, alpha: 0.02 * atmosphereIntensity },
      { radius: planetRadius * 1.06, alpha: 0.015 * atmosphereIntensity },
      { radius: planetRadius * 1.08, alpha: 0.01 * atmosphereIntensity },
    ];

    const ctx = renderer.getContext2D();
    ctx.save();

    for (const layer of layers) {
      const gradient = ctx.createRadialGradient(
        planetCenter.x,
        planetCenter.y,
        planetRadius,
        planetCenter.x,
        planetCenter.y,
        layer.radius
      );

      gradient.addColorStop(0, 'rgba(135, 206, 235, 0)');
      gradient.addColorStop(0.7, `rgba(135, 206, 235, ${layer.alpha * 0.5})`);
      gradient.addColorStop(1, `rgba(135, 206, 235, ${layer.alpha})`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(planetCenter.x, planetCenter.y, layer.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

import type { RocketState } from '../core/types.js';
import { Vector2 } from '../physics/Vector2.js';
import type { CanvasRenderer } from './CanvasRenderer.js';

export interface RocketVisualConfig {
  // Stage dimensions (from bottom to top)
  stage1Width: number;
  stage1Height: number;
  stage2Width: number;
  stage2Height: number;
  payloadWidth: number;
  payloadHeight: number;

  // Colors - cartoonish but realistic
  stage1Color: string;
  stage1AccentColor: string;
  stage2Color: string;
  stage2AccentColor: string;
  payloadColor: string;
  payloadAccentColor: string;
  exhaustColor: string;
  exhaustCoreColor: string;

  // Exhaust properties
  exhaustLength: number;
  exhaustWidth: number;

  // Visual details
  windowColor: string;
  finColor: string;
  fuelIndicatorBorder: string;
}

// Simple, stylized rocket drawing. Dimensions are tuned for readability,
// not strict real-world scale.
export class RocketRenderer {
  private config: RocketVisualConfig;
  // Optional sprite support: full rocket and upper-stage-only skins
  private spriteFull: HTMLImageElement | null = null;
  private spriteUpper: HTMLImageElement | null = null;
  private spritesLoaded = false;

  constructor(config?: Partial<RocketVisualConfig>) {
    this.config = {
      // Better looking rocket design - larger and more detailed
      stage1Width: 50,
      stage1Height: 130,
      stage2Width: 35,
      stage2Height: 70,
      payloadWidth: 25,
      payloadHeight: 35,

      // More realistic and attractive colors
      stage1Color: '#f0f0f0', // Almost white main body
      stage1AccentColor: '#2c5aa0', // NASA blue stripes
      stage2Color: '#ffffff', // Pure white upper stage
      stage2AccentColor: '#c0392b', // Deep red accent
      payloadColor: '#e67e22', // Professional orange
      payloadAccentColor: '#d35400', // Darker orange detail
      exhaustColor: '#ff4500', // Orange red flame
      exhaustCoreColor: '#ffff00', // Bright yellow core

      exhaustLength: 25,
      exhaustWidth: 12,

      // Enhanced visual details
      windowColor: '#4169e1', // Royal blue windows
      finColor: '#2c3e50', // Dark metallic fins
      fuelIndicatorBorder: '#34495e', // Dark border

      ...config,
    };

    // Try to load optional sprites if present in /assets
    // - /assets/rocket_full.png    (whole rocket)
    // - /assets/upper_stage.png    (upper stage only)
    // These are optional; renderer will fall back to vector shapes if missing.
    try {
      const tryLoad = (candidates: string[], set: (img: HTMLImageElement) => void) => {
        const attempt = (idx: number) => {
          if (idx >= candidates.length) return;
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            set(img);
            this.spritesLoaded = true;
          };
          img.onerror = () => attempt(idx + 1);
          img.src = candidates[idx];
        };
        attempt(0);
      };
      const meta = import.meta as unknown as { env?: { BASE_URL?: string } };
      const withBase = (p: string) =>
        meta.env?.BASE_URL
          ? `${meta.env.BASE_URL.replace(/\/+$/, '/')}${p.replace(/^\/+/, '')}`
          : `/${p.replace(/^\/+/, '')}`;
      tryLoad(
        [
          withBase('assets/rocket_full.png'),
          withBase('assets/rocket_full.jpg'),
          withBase('assets/rocket_full.jpeg'),
          withBase('assets/rocket_full.webp'),
        ],
        (img) => {
          this.spriteFull = img;
        }
      );
      tryLoad(
        [
          withBase('assets/upper_stage.png'),
          withBase('assets/upper_stage.jpg'),
          withBase('assets/upper_stage.jpeg'),
          withBase('assets/upper_stage.webp'),
        ],
        (img) => {
          this.spriteUpper = img;
        }
      );
    } catch {}
  }

  /**
   * Render the rocket with current state. Keeps the rocket centered on its
   * position to avoid visual snapping while rotating.
   */
  render(renderer: CanvasRenderer, rocketState: RocketState): void {
    const position = rocketState.position;
    const rotation = rocketState.visualRotation ?? rocketState.rotation;
    const isEngineOn = rocketState.isEngineIgnited;
    const throttle = rocketState.throttle;

    // Compute total height to center the rocket around its position to avoid visual snapping
    const totalDims = this.getRocketBounds(rocketState);
    const yOffset = -totalDims.height / 2; // center vertically on position

    // 0 rotation = rocket points up visually; use same sign as physics
    renderer.drawRotated(position, rotation, () => {
      const useSprites = !!(this.spriteFull && this.spriteUpper);
      if (useSprites) {
        const spriteFull = this.spriteFull as HTMLImageElement;
        const spriteUpper = this.spriteUpper as HTMLImageElement;
        // When using sprites, draw the exhaust first so it appears behind the
        // sprite and only shows through transparent areas.
        const currentStage = rocketState.currentStage ?? 0;
        const exLift = currentStage === 0 ? 10 : 14; // start plume lower for stage 2
        rocketState.exhaustY = yOffset + exLift;
        if (isEngineOn && throttle > 0) {
          this.drawExhaust(renderer, throttle, rocketState);
        }
        // Now draw sprite slightly larger and nudged upward so hitbox sits lower
        const img = currentStage === 0 ? spriteFull : spriteUpper;
        const totalDims = this.getRocketBounds(rocketState);
        // Per‑stage sprite scaling. Upper stage should be shorter and slightly wider.
        const fullW = totalDims.width * 1.15;
        const fullH = totalDims.height * 1.15;
        const upperW = totalDims.width * 1.35; // a bit wider
        const upperH = totalDims.height * 0.65; // still shorter, but less extreme
        const drawW = currentStage === 0 ? fullW : upperW;
        const drawH = currentStage === 0 ? fullH : upperH;
        const spriteYOffset = currentStage === 0 ? 8 : 0;
        renderer.drawSprite(
          img,
          new Vector2(0, yOffset + totalDims.height / 2 + spriteYOffset),
          drawW,
          drawH
        );
      } else {
        // Fallback vector rocket: draw body first (sets exhaust anchor), then exhaust
        this.drawRocketBody(renderer, rocketState, yOffset);
        if (isEngineOn && throttle > 0) {
          this.drawExhaust(renderer, throttle, rocketState);
        }
      }
      // Draw separated stages (visual decoupling)
      this.drawSeparatedStages(renderer, rocketState);
    });

    // Compute and expose engine base world position for other systems (smoke/speed effects)
    const exY = rocketState.exhaustY ?? 0; // local Y of stage bottom
    // Account for visible nozzle drop below stage bottom (stage-dependent)
    const currentStage = rocketState.currentStage ?? 0;
    const nozzleDrop = currentStage === 0 ? 6 : 4; // px below stage bottom in local space
    const engineLocalY = exY - nozzleDrop;
    // Convert local (0, engineLocalY) to world using rotation (y-up): (dx,dy)=(-sin r * y, cos r * y)
    const enginePos = new Vector2(
      position.x + -Math.sin(rotation) * engineLocalY,
      position.y + Math.cos(rotation) * engineLocalY
    );
    rocketState.engineWorldPos = enginePos;
    // Local down vector (0,-1) -> world (sin r, -cos r)
    rocketState.engineDownDir = new Vector2(Math.sin(rotation), -Math.cos(rotation));
  }

  /**
   * Draw the main rocket body with stages (only active and above). Lower
   * stages are considered separated and are drawn elsewhere.
   */
  private drawRocketBody(
    renderer: CanvasRenderer,
    rocketState: RocketState,
    baseYOffset = 0
  ): void {
    let currentY = baseYOffset; // start centered to reduce rotation snapping

    // Draw only active and higher stages (lower stages are decoupled)
    const stages = rocketState.stages || [];
    const currentStageIndex = rocketState.currentStage;

    // Store active stage bottom position for exhaust positioning
    let activeStageBottomY = 0;

    for (let i = currentStageIndex; i < stages.length; i++) {
      const stage = stages[i];
      const isActiveStage = i === currentStageIndex;

      // Determine stage visual properties
      let width: number;
      let height: number;
      let color: string;

      if (i === 0) {
        // First stage (booster)
        width = this.config.stage1Width;
        height = this.config.stage1Height;
        color = this.config.stage1Color;
      } else if (i === 1) {
        // Second stage
        width = this.config.stage2Width;
        height = this.config.stage2Height;
        color = this.config.stage2Color;
      } else {
        // Additional stages (smaller)
        width = this.config.payloadWidth;
        height = this.config.payloadHeight;
        color = this.config.payloadColor;
      }

      // Draw stage body (rounded effect via stroke)
      const stagePos = new Vector2(-width / 2, currentY);
      renderer.drawRectangle(stagePos, width, height, color, '#000000', 2);

      // Add visual details for each stage
      if (i === 0) {
        // First stage details
        this.drawStage1Details(renderer, stagePos, width, height);
      } else if (i === 1) {
        // Second stage details
        this.drawStage2Details(renderer, stagePos, width, height);
      }

      // Store active stage bottom position for exhaust
      if (isActiveStage) {
        activeStageBottomY = currentY;
      }

      currentY += height;
    }

    // Store exhaust position for later use (world conversion happens after rotate)
    rocketState.exhaustY = activeStageBottomY;

    // Draw payload/nose cone
    const nosePos = new Vector2(-this.config.payloadWidth / 2, currentY);
    renderer.drawRectangle(
      nosePos,
      this.config.payloadWidth,
      this.config.payloadHeight,
      this.config.payloadColor,
      '#000000',
      1
    );

    // Draw nose cone tip (triangle)
    const tipHeight = 4;
    const tipPos = new Vector2(0, currentY + this.config.payloadHeight);
    this.drawTriangle(
      renderer,
      tipPos,
      this.config.payloadWidth / 2,
      tipHeight,
      this.config.payloadColor
    );
  }

  /**
   * Draw exhaust plume - scaled by active stage
   */
  private drawExhaust(renderer: CanvasRenderer, throttle: number, rocketState: RocketState): void {
    const exhaustIntensity = throttle;

    // Scale exhaust based on current stage (bigger for first stage)
    const currentStage = rocketState.currentStage || 0;
    let exhaustScale = 1.0;

    if (currentStage === 0) {
      // First stage - large exhaust
      exhaustScale = 1.5;
    } else if (currentStage === 1) {
      // Second stage - make plume smaller (narrower & shorter)
      exhaustScale = 0.45;
    } else {
      // Upper stages - smaller exhaust
      exhaustScale = 0.7;
    }

    // Allow stage-specific shaping (length vs width)
    let exhaustLength = this.config.exhaustLength * exhaustIntensity * exhaustScale;
    let exhaustWidth = this.config.exhaustWidth * exhaustIntensity * exhaustScale;
    if (currentStage === 1) {
      exhaustLength *= 0.8; // even shorter for stage 2
      exhaustWidth *= 0.85; // slightly narrower
    }
    // Expose current exhaust dimensions for external effects anchoring
    rocketState.exhaustLength = exhaustLength;
    rocketState.exhaustWidth = exhaustWidth;

    // Get exhaust position from active stage bottom (stored in rocketState)
    const exhaustY = rocketState.exhaustY || 0;

    // Main exhaust flame (positioned at active stage bottom)
    // Shift slightly to the right for stage 2 to align with nozzle in art
    // (previously 5px; adjusted to 2px per feedback)
    const xShift = currentStage === 1 ? 2 : 0;
    const exhaustPos = new Vector2(-exhaustWidth / 2 + xShift, exhaustY - exhaustLength);
    renderer.drawRectangle(exhaustPos, exhaustWidth, exhaustLength, this.config.exhaustColor);

    // Inner core (brighter)
    const coreWidth = exhaustWidth * 0.6;
    const coreLength = exhaustLength * 0.8;
    const corePos = new Vector2(-coreWidth / 2 + xShift, exhaustY - coreLength);
    renderer.drawRectangle(corePos, coreWidth, coreLength, this.config.exhaustCoreColor);

    // Exhaust particles (simple effect)
    this.drawExhaustParticles(renderer, throttle, exhaustScale, exhaustY);
  }

  /**
   * Draw simple exhaust particle effect
   */
  private drawExhaustParticles(
    renderer: CanvasRenderer,
    throttle: number,
    exhaustScale = 1.0,
    exhaustY = 0
  ): void {
    const particleCount = Math.floor(throttle * 8 * exhaustScale);

    for (let i = 0; i < particleCount; i++) {
      const offsetX = (Math.random() - 0.5) * this.config.exhaustWidth * 1.5 * exhaustScale;
      const offsetY = exhaustY - Math.random() * this.config.exhaustLength * 1.2 * exhaustScale;
      const particleSize = (Math.random() * 2 + 1) * exhaustScale;

      const particlePos = new Vector2(offsetX, offsetY);
      const alpha = Math.random() * 0.8 + 0.2;
      const color = `rgba(255, ${Math.floor(100 + Math.random() * 155)}, 0, ${alpha})`;

      renderer.drawCircle(particlePos, particleSize, color);
    }
  }

  /**
   * Draw separated stages (visual decoupling animation)
   */
  private drawSeparatedStages(renderer: CanvasRenderer, rocketState: RocketState): void {
    // TODO: Add animated separated stages falling away
    // For now, separated stages just disappear (handled by only drawing active+ stages)
  }

  /**
   * Render a single detached stage with the same proportions/details as the main rocket
   */
  public renderDetachedStage(
    renderer: CanvasRenderer,
    stageIndex: number,
    position: Vector2,
    rotation: number,
    alpha = 1
  ): void {
    const clampAlpha = Math.max(0, Math.min(1, alpha));
    const withAlpha = (hex: string): string => {
      // Convert e.g. '#ffffff' to rgba with provided alpha when used as fill
      // If already rgba string, just append alpha multiplier style
      if (hex.startsWith('#')) {
        // parse shorthand or full hex
        const h = hex.replace('#', '');
        const bigint = Number.parseInt(
          h.length === 3
            ? h
                .split('')
                .map((c) => c + c)
                .join('')
            : h,
          16
        );
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${clampAlpha})`;
      }
      // fall back
      return hex;
    };

    renderer.drawRotated(position, rotation, () => {
      let width = this.config.stage2Width;
      let height = this.config.stage2Height;
      let bodyColor = this.config.stage2Color;

      if (stageIndex === 0) {
        width = this.config.stage1Width;
        height = this.config.stage1Height;
        bodyColor = this.config.stage1Color;
      }

      // Center the body around origin so detached stage aligns with rocket
      const bodyPos = new Vector2(-width / 2, -height / 2);
      renderer.drawRectangle(bodyPos, width, height, withAlpha(bodyColor), '#000000', 1);

      // Details
      if (stageIndex === 0) {
        this.drawStage1Details(renderer, bodyPos, width, height);
      } else {
        this.drawStage2Details(renderer, bodyPos, width, height);
      }
    });
  }

  /**
   * Draw a triangle (for nose cone)
   */
  private drawTriangle(
    renderer: CanvasRenderer,
    tip: Vector2,
    baseWidth: number,
    height: number,
    color: string
  ): void {
    // Simple triangle using lines
    const leftBase = new Vector2(tip.x - baseWidth, tip.y - height);
    const rightBase = new Vector2(tip.x + baseWidth, tip.y - height);

    renderer.drawLine(tip, leftBase, color, 2);
    renderer.drawLine(tip, rightBase, color, 2);
    renderer.drawLine(leftBase, rightBase, color, 2);
  }

  /**
   * Get rocket visual bounds for camera following
   */
  getRocketBounds(rocketState: RocketState): { width: number; height: number } {
    const stages = rocketState.stages || [];
    const start = Math.max(0, Math.min(rocketState.currentStage ?? 0, stages.length));
    let totalHeight = this.config.payloadHeight + 4; // include nose cone
    let maxWidth = this.config.payloadWidth;

    // Sprite-aware scaling factors (must match drawSprite)
    const useSprites = !!(this.spriteFull && this.spriteUpper);
    const fullHScale = 1.15;
    const fullWScale = 1.15;
    const upperHScale = 0.65; // shorter, adjusted to match visual sprite
    const upperWScale = 1.35; // a bit wider

    for (let i = start; i < stages.length; i++) {
      if (i === 0) {
        totalHeight += useSprites
          ? this.config.stage1Height * fullHScale
          : this.config.stage1Height;
        maxWidth = Math.max(
          maxWidth,
          useSprites ? this.config.stage1Width * fullWScale : this.config.stage1Width
        );
      } else if (i === 1) {
        totalHeight += useSprites
          ? this.config.stage2Height * upperHScale
          : this.config.stage2Height;
        maxWidth = Math.max(
          maxWidth,
          useSprites ? this.config.stage2Width * upperWScale : this.config.stage2Width
        );
      } else {
        totalHeight += this.config.payloadHeight;
        maxWidth = Math.max(maxWidth, this.config.payloadWidth);
      }
    }
    return { width: maxWidth, height: totalHeight };
  }

  /**
   * Draw first stage visual details
   */
  private drawStage1Details(
    renderer: CanvasRenderer,
    pos: Vector2,
    width: number,
    height: number
  ): void {
    // Blue accent stripes
    const stripeWidth = 4;
    const stripe1Pos = new Vector2(pos.x + 5, pos.y + 10);
    const stripe2Pos = new Vector2(pos.x + width - 5 - stripeWidth, pos.y + 10);

    renderer.drawRectangle(stripe1Pos, stripeWidth, height - 20, this.config.stage1AccentColor);
    renderer.drawRectangle(stripe2Pos, stripeWidth, height - 20, this.config.stage1AccentColor);

    // Engine nozzles at bottom
    const nozzleWidth = 8;
    const nozzleHeight = 6;
    const nozzle1Pos = new Vector2(pos.x + width * 0.25 - nozzleWidth / 2, pos.y - nozzleHeight);
    const nozzle2Pos = new Vector2(pos.x + width * 0.75 - nozzleWidth / 2, pos.y - nozzleHeight);

    renderer.drawRectangle(nozzle1Pos, nozzleWidth, nozzleHeight, this.config.finColor);
    renderer.drawRectangle(nozzle2Pos, nozzleWidth, nozzleHeight, this.config.finColor);

    // Side fins
    this.drawFins(renderer, pos, width, height);
  }

  /**
   * Draw second stage visual details
   */
  private drawStage2Details(
    renderer: CanvasRenderer,
    pos: Vector2,
    width: number,
    height: number
  ): void {
    // Red accent band
    const bandHeight = 8;
    const bandPos = new Vector2(pos.x, pos.y + height * 0.3);
    renderer.drawRectangle(bandPos, width, bandHeight, this.config.stage2AccentColor);

    // Windows/portholes
    const windowSize = 4;
    const window1Pos = new Vector2(pos.x + width * 0.3 - windowSize / 2, pos.y + height * 0.6);
    const window2Pos = new Vector2(pos.x + width * 0.7 - windowSize / 2, pos.y + height * 0.6);

    renderer.drawCircle(window1Pos, windowSize / 2, this.config.windowColor);
    renderer.drawCircle(window2Pos, windowSize / 2, this.config.windowColor);

    // Single engine nozzle
    const nozzleWidth = 6;
    const nozzleHeight = 4;
    const nozzlePos = new Vector2(pos.x + width / 2 - nozzleWidth / 2, pos.y - nozzleHeight);
    renderer.drawRectangle(nozzlePos, nozzleWidth, nozzleHeight, this.config.finColor);
  }

  /**
   * Draw fins on first stage
   */
  private drawFins(renderer: CanvasRenderer, pos: Vector2, width: number, height: number): void {
    const finWidth = 8;
    const finHeight = 20;

    // Left fin
    const leftFinPos = new Vector2(pos.x - finWidth, pos.y + height - finHeight - 10);
    renderer.drawRectangle(leftFinPos, finWidth, finHeight, this.config.finColor);

    // Right fin
    const rightFinPos = new Vector2(pos.x + width, pos.y + height - finHeight - 10);
    renderer.drawRectangle(rightFinPos, finWidth, finHeight, this.config.finColor);
  }

  /**
   * Update visual configuration
   */
  updateConfig(newConfig: Partial<RocketVisualConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

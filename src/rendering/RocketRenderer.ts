import { Vector2 } from '../physics/Vector2.js';
import { CanvasRenderer } from './CanvasRenderer.js';
import { RocketState } from '../core/types.js';

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

export class RocketRenderer {
  private config: RocketVisualConfig;
  
  constructor(config?: Partial<RocketVisualConfig>) {
    this.config = {
      // Better looking rocket design - larger and more detailed
      stage1Width: 50,
      stage1Height: 100,
      stage2Width: 35,
      stage2Height: 70,
      payloadWidth: 25,
      payloadHeight: 35,
      
      // More realistic and attractive colors
      stage1Color: '#f0f0f0',        // Almost white main body
      stage1AccentColor: '#2c5aa0',   // NASA blue stripes
      stage2Color: '#ffffff',        // Pure white upper stage
      stage2AccentColor: '#c0392b',   // Deep red accent
      payloadColor: '#e67e22',       // Professional orange
      payloadAccentColor: '#d35400',  // Darker orange detail
      exhaustColor: '#ff4500',       // Orange red flame
      exhaustCoreColor: '#ffff00',   // Bright yellow core
      
      exhaustLength: 25,
      exhaustWidth: 12,
      
      // Enhanced visual details
      windowColor: '#4169e1',        // Royal blue windows
      finColor: '#2c3e50',          // Dark metallic fins
      fuelIndicatorBorder: '#34495e', // Dark border
      
      ...config
    };
  }

  /**
   * Render the rocket with current state
   */
  render(renderer: CanvasRenderer, rocketState: RocketState): void {
    const position = rocketState.position;
    const rotation = rocketState.rotation;
    const isEngineOn = rocketState.isEngineIgnited;
    const throttle = rocketState.throttle;
    
    // Simple: 0 rotation = rocket points up visually
    renderer.drawRotated(position, rotation, () => {
      this.drawRocketBody(renderer, rocketState);
      
      if (isEngineOn && throttle > 0) {
        this.drawExhaust(renderer, throttle, rocketState);
      }
      
      // Draw separated stages (visual decoupling)
      this.drawSeparatedStages(renderer, rocketState);
    });
  }

  /**
   * Draw the main rocket body with stages (only active and above)
   */
  private drawRocketBody(renderer: CanvasRenderer, rocketState: RocketState): void {
    let currentY = 0;
    
    // Draw only active and higher stages (lower stages are decoupled)
    const stages = rocketState.stages || [];
    const currentStageIndex = rocketState.currentStage;
    
    // Store active stage bottom position for exhaust positioning
    let activeStageBottomY = 0;
    
    for (let i = currentStageIndex; i < stages.length; i++) {
      const stage = stages[i];
      const isActiveStage = i === currentStageIndex;
      
      // Determine stage visual properties
      let width: number, height: number, color: string;
      
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
      
      // Draw stage body with rounded corners effect
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
    
    // Store exhaust position for later use
    rocketState.exhaustY = activeStageBottomY;
    
    // Draw payload/nose cone
    const nosePos = new Vector2(-this.config.payloadWidth / 2, currentY);
    renderer.drawRectangle(nosePos, this.config.payloadWidth, this.config.payloadHeight, this.config.payloadColor, '#000000', 1);
    
    // Draw nose cone tip (triangle)
    const tipHeight = 4;
    const tipPos = new Vector2(0, currentY + this.config.payloadHeight);
    this.drawTriangle(renderer, tipPos, this.config.payloadWidth / 2, tipHeight, this.config.payloadColor);
  }

  /**
   * Draw exhaust plume - scaled by active stage
   */
  private drawExhaust(renderer: CanvasRenderer, throttle: number, rocketState?: any): void {
    const exhaustIntensity = throttle;
    
    // Scale exhaust based on current stage (bigger for first stage)
    const currentStage = rocketState?.currentStage || 0;
    let exhaustScale = 1.0;
    
    if (currentStage === 0) {
      // First stage - large exhaust
      exhaustScale = 1.5;
    } else if (currentStage === 1) {
      // Second stage - medium exhaust 
      exhaustScale = 1.0;
    } else {
      // Upper stages - smaller exhaust
      exhaustScale = 0.7;
    }
    
    const exhaustLength = this.config.exhaustLength * exhaustIntensity * exhaustScale;
    const exhaustWidth = this.config.exhaustWidth * exhaustIntensity * exhaustScale;
    
    // Get exhaust position from active stage bottom (stored in rocketState)
    const exhaustY = rocketState.exhaustY || 0;
    
    // Main exhaust flame (positioned at active stage bottom)
    const exhaustPos = new Vector2(-exhaustWidth / 2, exhaustY - exhaustLength);
    renderer.drawRectangle(exhaustPos, exhaustWidth, exhaustLength, this.config.exhaustColor);
    
    // Inner core (brighter)
    const coreWidth = exhaustWidth * 0.6;
    const coreLength = exhaustLength * 0.8;
    const corePos = new Vector2(-coreWidth / 2, exhaustY - coreLength);
    renderer.drawRectangle(corePos, coreWidth, coreLength, this.config.exhaustCoreColor);
    
    // Exhaust particles (simple effect)
    this.drawExhaustParticles(renderer, throttle, exhaustScale, exhaustY);
  }

  /**
   * Draw simple exhaust particle effect
   */
  private drawExhaustParticles(renderer: CanvasRenderer, throttle: number, exhaustScale: number = 1.0, exhaustY: number = 0): void {
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
   * Draw a triangle (for nose cone)
   */
  private drawTriangle(renderer: CanvasRenderer, tip: Vector2, baseWidth: number, height: number, color: string): void {
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
    let totalHeight = this.config.payloadHeight + 4; // Include nose cone
    
    for (const stage of stages) {
      if (stage === stages[0]) {
        totalHeight += this.config.stage1Height;
      } else if (stage === stages[1]) {
        totalHeight += this.config.stage2Height;
      } else {
        totalHeight += this.config.payloadHeight;
      }
    }
    
    const maxWidth = Math.max(this.config.stage1Width, this.config.stage2Width, this.config.payloadWidth);
    
    return { width: maxWidth, height: totalHeight };
  }

  /**
   * Draw first stage visual details
   */
  private drawStage1Details(renderer: CanvasRenderer, pos: Vector2, width: number, height: number): void {
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
  private drawStage2Details(renderer: CanvasRenderer, pos: Vector2, width: number, height: number): void {
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
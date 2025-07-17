import { CanvasRenderer } from '../rendering/CanvasRenderer.js';
import { GameState } from '../core/types.js';
import { Vector2 } from '../physics/Vector2.js';

export class HUDSystem {
  private canvas: HTMLCanvasElement;
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /**
   * Render the HUD overlay with flight data
   */
  render(renderer: CanvasRenderer, gameState: GameState, missionTimer?: number): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    // Save current transformation state
    ctx.save();
    
    // Reset transformation to screen coordinates for HUD
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // Calculate flight data
    const altitude = gameState.world.getAltitude(gameState.rocket.position.magnitude());
    const velocity = gameState.rocket.velocity.magnitude();
    const mass = gameState.rocket.mass;
    const fuel = gameState.rocket.fuel;
    const throttle = gameState.rocket.throttle;
    
    // Get rocket configuration for TWR and ISP calculations
    const rocket = gameState.rocket;
    let currentTWR = 0;
    let currentISP = 0;
    
    if (rocket.isEngineIgnited && rocket.throttle > 0) {
      const gravity = gameState.world.getGravitationalAcceleration(gameState.rocket.position.magnitude());
      const thrust = rocket.stages[rocket.currentStage]?.thrust || 0;
      const actualThrust = thrust * throttle;
      currentTWR = actualThrust / (mass * gravity);
      currentISP = rocket.stages[rocket.currentStage]?.specificImpulse || 0;
    }

    // HUD styling
    ctx.font = '14px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;

    // Draw background panel - taller for fuel gauge
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 280, 220);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, 280, 220);

    // Draw flight data
    ctx.fillStyle = '#ffffff';
    const startY = 30;
    const lineHeight = 20;
    let y = startY;

    // Format and display data
    ctx.fillText(`Altitude:   ${this.formatNumber(altitude, 0)} m`, 20, y);
    y += lineHeight;
    ctx.fillText(`Velocity:   ${this.formatNumber(velocity, 1)} m/s`, 20, y);
    y += lineHeight;
    ctx.fillText(`Mass:       ${this.formatNumber(mass, 0)} kg`, 20, y);
    y += lineHeight;
    ctx.fillText(`Throttle:   ${Math.round(throttle * 100)}%`, 20, y);
    y += lineHeight;
    ctx.fillText(`TWR:        ${currentTWR.toFixed(2)}`, 20, y);
    y += lineHeight;
    ctx.fillText(`ISP:        ${Math.round(currentISP)} s`, 20, y);
    y += lineHeight;
    ctx.fillText(`Stage:      ${rocket.currentStage + 1}`, 20, y);

    // Engine status indicator
    y += lineHeight;
    const engineStatus = rocket.isEngineIgnited ? 'ON' : 'OFF';
    const statusColor = rocket.isEngineIgnited ? '#00ff00' : '#ff0000';
    ctx.fillStyle = statusColor;
    ctx.fillText(`Engines:    ${engineStatus}`, 20, y);

    // Draw fuel gauge
    y += lineHeight + 10;
    this.drawFuelGauge(ctx, 20, y, fuel, rocket, gameState);

    // Draw mission timer and restart button in top-right corner
    this.drawMissionTimer(ctx, missionTimer || 0);
    this.drawRestartButton(ctx);

    // Position indicator removed - was not useful

    // Draw controls help
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(10, this.canvas.height - 140, 200, 130);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, this.canvas.height - 140, 200, 130);

    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    let helpY = this.canvas.height - 120;
    ctx.fillText('Controls:', 20, helpY);
    helpY += 15;
    ctx.fillText('SPACE - Ignite', 20, helpY);
    helpY += 15;
    ctx.fillText('Z - Full throttle', 20, helpY);
    helpY += 15;
    ctx.fillText('X - Zero throttle', 20, helpY);
    helpY += 15;
    ctx.fillText('C - Cut engines', 20, helpY);
    helpY += 15;
    ctx.fillText('S - Stage', 20, helpY);
    helpY += 15;
    ctx.fillText('Scroll - Zoom', 20, helpY);
    helpY += 15;
    ctx.fillText('R - Restart', 20, helpY);

    // Restore transformation state
    ctx.restore();
  }

  /**
   * Format number with appropriate units and precision
   */
  private formatNumber(value: number, decimals: number = 0): string {
    if (value >= 1_000_000) {
      return (value / 1_000_000).toFixed(decimals) + 'M';
    } else if (value >= 1_000) {
      return (value / 1_000).toFixed(decimals) + 'k';
    } else {
      return value.toFixed(decimals);
    }
  }

  /**
   * Draw rocket position and attitude indicator
   */
  private drawRocketPositionIndicator(ctx: CanvasRenderingContext2D, gameState: GameState): void {
    const width = 180;
    const height = 120;
    const x = this.canvas.width - width - 20;
    const y = this.canvas.height - height - 20;
    
    // Background panel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
    
    // Calculate rocket data
    const rocketPos = gameState.rocket.position;
    const altitude = gameState.world.getAltitude(rocketPos.magnitude());
    const rocketRotation = gameState.rocket.rotation;
    const velocity = gameState.rocket.velocity;
    
    // Draw ground horizon line
    const horizonY = y + height - 30;
    const centerX = x + width / 2;
    
    // Ground (brown)
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(x + 1, horizonY, width - 2, 30);
    
    // Sky (gradient blue)
    const gradient = ctx.createLinearGradient(0, y + 1, 0, horizonY);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(1, '#4169E1');
    ctx.fillStyle = gradient;
    ctx.fillRect(x + 1, y + 1, width - 2, horizonY - y - 1);
    
    // Horizon line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 10, horizonY);
    ctx.lineTo(x + width - 10, horizonY);
    ctx.stroke();
    
    // Draw rocket representation
    this.drawRocketIcon(ctx, centerX, horizonY - 20, rocketRotation, gameState.rocket.isEngineIgnited);
    
    // Velocity vector arrow
    if (velocity.magnitude() > 1) {
      this.drawVelocityArrow(ctx, centerX, horizonY - 20, velocity, rocketRotation);
    }
    
    // Attitude and altitude info
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px monospace';
    
    // Rotation angle (degrees from vertical)
    const rotationDeg = (rocketRotation * 180 / Math.PI).toFixed(0);
    ctx.fillText(`Attitude: ${rotationDeg}°`, x + 10, y + 15);
    
    // Velocity magnitude and direction
    const velMag = velocity.magnitude();
    const velAngleDeg = (Math.atan2(velocity.x, velocity.y) * 180 / Math.PI).toFixed(0);
    ctx.fillText(`Velocity: ${velMag.toFixed(1)} m/s`, x + 10, y + 30);
    ctx.fillText(`Direction: ${velAngleDeg}°`, x + 10, y + 45);
    
    // Distance from center (position magnitude)
    const distanceFromCenter = rocketPos.magnitude();
    ctx.fillText(`Radius: ${this.formatNumber(distanceFromCenter, 1)} m`, x + 10, y + 60);
    
    // Label
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('POSITION & ATTITUDE', centerX, y + height - 5);
    ctx.textAlign = 'left'; // Reset
  }

  /**
   * Draw small rocket icon showing orientation
   */
  private drawRocketIcon(ctx: CanvasRenderingContext2D, x: number, y: number, rotation: number, engineOn: boolean): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    
    // Rocket body (white)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-2, -8, 4, 16);
    
    // Rocket nose (orange)
    ctx.fillStyle = '#ff8800';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-2, -12);
    ctx.lineTo(2, -12);
    ctx.closePath();
    ctx.fill();
    
    // Engine exhaust (if on)
    if (engineOn) {
      ctx.fillStyle = '#ff4500';
      ctx.fillRect(-1, 8, 2, 6);
    }
    
    // Fins
    ctx.fillStyle = '#666666';
    ctx.fillRect(-3, 4, 2, 4);
    ctx.fillRect(1, 4, 2, 4);
    
    ctx.restore();
  }

  /**
   * Draw velocity direction arrow
   */
  private drawVelocityArrow(ctx: CanvasRenderingContext2D, x: number, y: number, velocity: Vector2, rocketRotation: number): void {
    const velAngle = Math.atan2(velocity.x, velocity.y);
    const arrowLength = 20;
    
    ctx.save();
    ctx.translate(x, y);
    
    // Green velocity arrow
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    
    // Arrow line
    const endX = Math.sin(velAngle) * arrowLength;
    const endY = -Math.cos(velAngle) * arrowLength;
    
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    
    // Arrow head
    ctx.save();
    ctx.translate(endX, endY);
    ctx.rotate(velAngle);
    
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-3, -6);
    ctx.lineTo(3, -6);
    ctx.closePath();
    ctx.fillStyle = '#00ff00';
    ctx.fill();
    
    ctx.restore();
    ctx.restore();
  }

  /**
   * Draw fuel gauge for current stage
   */
  private drawFuelGauge(ctx: CanvasRenderingContext2D, x: number, y: number, totalFuel: number, rocket: any, gameState: GameState): void {
    const currentStage = rocket.stages[rocket.currentStage];
    if (!currentStage) return;

    const maxFuel = currentStage.propellantMass;
    const currentFuel = currentStage.fuelRemaining;
    const fuelRatio = Math.min(1, Math.max(0, currentFuel / maxFuel));

    // Gauge dimensions
    const gaugeWidth = 200;
    const gaugeHeight = 20;

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';
    ctx.fillText(`Fuel: ${this.formatNumber(currentFuel, 0)}/${this.formatNumber(maxFuel, 0)} kg`, x, y - 5);

    // Gauge background
    ctx.fillStyle = '#333333';
    ctx.fillRect(x, y, gaugeWidth, gaugeHeight);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, gaugeWidth, gaugeHeight);

    // Fuel bar - color coded
    const fuelBarWidth = gaugeWidth * fuelRatio;
    let fuelColor: string;
    
    if (fuelRatio > 0.5) {
      fuelColor = '#00ff00'; // Green - good
    } else if (fuelRatio > 0.2) {
      fuelColor = '#ffff00'; // Yellow - warning
    } else {
      fuelColor = '#ff0000'; // Red - critical
    }

    ctx.fillStyle = fuelColor;
    ctx.fillRect(x + 1, y + 1, fuelBarWidth - 2, gaugeHeight - 2);

    // Percentage text
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    const percentText = `${Math.round(fuelRatio * 100)}%`;
    const textWidth = ctx.measureText(percentText).width;
    ctx.fillText(percentText, x + gaugeWidth / 2 - textWidth / 2, y + 14);
  }

  /**
   * Draw mission timer
   */
  private drawMissionTimer(ctx: CanvasRenderingContext2D, missionTime: number): void {
    const minutes = Math.floor(missionTime / 60);
    const seconds = Math.floor(missionTime % 60);
    const timeText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // Timer background
    const timerX = this.canvas.width - 150;
    const timerY = 10;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(timerX, timerY, 140, 30);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(timerX, timerY, 140, 30);
    
    // Timer text
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Mission: ${timeText}`, timerX + 70, timerY + 20);
    ctx.textAlign = 'left'; // Reset
  }

  /**
   * Draw restart button
   */
  private drawRestartButton(ctx: CanvasRenderingContext2D): void {
    const buttonX = this.canvas.width - 80;
    const buttonY = 50;
    const buttonW = 70;
    const buttonH = 25;
    
    // Button background
    ctx.fillStyle = 'rgba(200, 50, 50, 0.8)';
    ctx.fillRect(buttonX, buttonY, buttonW, buttonH);
    ctx.strokeStyle = '#ff6666';
    ctx.lineWidth = 1;
    ctx.strokeRect(buttonX, buttonY, buttonW, buttonH);
    
    // Button text
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('RESTART', buttonX + buttonW/2, buttonY + 16);
    ctx.textAlign = 'left'; // Reset
    
    // Store button bounds for click detection
    (this as any).restartButtonBounds = { x: buttonX, y: buttonY, width: buttonW, height: buttonH };
  }

  /**
   * Handle window resize
   */
  handleResize(): void {
    // HUD automatically adapts to canvas size
  }
}
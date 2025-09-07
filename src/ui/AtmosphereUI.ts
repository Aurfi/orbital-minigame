import type { WorldParameters } from '@/physics/WorldParameters';

type Message = { text: string; time: number; duration: number };

export class AtmosphereUI {
  private messages: Message[] = [];
  private lastLayer = -1;

  constructor(private canvas: HTMLCanvasElement) {}

  reset(): void {
    this.messages = [];
    this.lastLayer = -1;
  }

  addMessage(text: string, time: number, duration = 3.0): void {
    this.messages.push({ text, time, duration });
  }

  // Expose a copy of messages for testing/inspection
  getMessages(): ReadonlyArray<Message> {
    return [...this.messages];
  }

  checkLayers(world: WorldParameters, rocketRadius: number, currentTime: number): void {
    const altitude = world.getAltitude(rocketRadius);
    let currentLayer = -1;
    if (altitude < 11_000)
      currentLayer = 0; // Troposphere
    else if (altitude < 50_000)
      currentLayer = 1; // Stratosphere
    else if (altitude < 80_000)
      currentLayer = 2; // Mesosphere
    else if (altitude < 700_000)
      currentLayer = 3; // Thermosphere
    else currentLayer = 4; // Exosphere

    if (currentLayer > this.lastLayer && currentLayer >= 0) {
      // Special case: delay the Troposphere message until >= 1 km AGL
      if (currentLayer === 0 && altitude < 1_000) return;
      const labels = [
        "You're in the Troposphere !",
        'You reached the Stratosphere!',
        'You reached the Mesosphere!',
        'You reached the Thermosphere!',
        'You reached the Exosphere! (Near-space)',
      ];
      const msg = labels[currentLayer] ?? '';
      if (msg) this.addMessage(msg, currentTime, 3.0);
      this.lastLayer = currentLayer;
    }
  }

  update(currentTime: number): void {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (currentTime - m.time > m.duration) this.messages.splice(i, 1);
    }
  }

  render(currentTime: number): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx || this.messages.length === 0) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const centerX = this.canvas.width / 2;
    let offsetY = 90;
    for (const m of this.messages) {
      const age = currentTime - m.time;
      const fadeIn = Math.min(1, age * 3);
      const fadeOut = Math.min(1, Math.max(0, (m.duration - age) * 2));
      const alpha = fadeIn * fadeOut;

      ctx.font = '14px monospace';
      ctx.textAlign = 'left';
      const maxTextWidth = Math.min(this.canvas.width * 0.6, 380);
      const lines = this.wrapText(ctx, m.text, maxTextWidth);
      const lineHeight = 18;
      let textW = 0;
      for (const line of lines) textW = Math.max(textW, ctx.measureText(line).width);
      const padX = 12;
      const padY = 8;
      const panelW = textW + padX * 2;
      const panelH = lines.length * lineHeight + padY * 2;
      const panelX = centerX - panelW / 2;
      const panelY = offsetY;

      ctx.fillStyle = `rgba(0, 50, 100, ${alpha * 0.8})`;
      ctx.fillRect(panelX, panelY, panelW, panelH);

      ctx.strokeStyle = `rgba(100, 150, 255, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(panelX, panelY, panelW, panelH);

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

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
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
}

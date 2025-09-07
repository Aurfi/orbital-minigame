import { Vector2 } from '@/physics/Vector2';
import spaceFacts from '@/data/space_facts.json';

type Bubble = {
  text: string;
  pos: Vector2;
  bornAtMs: number;
  ttlSec: number;
  opacity: number;
};

export class FactBubblesSystem {
  private canvas: HTMLCanvasElement;
  private bubbles: Bubble[] = [];
  private shownFacts: Set<number> = new Set();
  private lastSpawnMs = 0;
  private nextIntervalSec = 35;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.loadShownFacts();
  }

  update(nowMs: number, altitude: number): void {
    // Hide facts on phones or narrow viewports
    const dpr = (typeof window !== 'undefined' && (window.devicePixelRatio || 1)) || 1;
    const cssW = (this.canvas as HTMLCanvasElement).clientWidth || Math.round(this.canvas.width / dpr);
    const isCoarse = (typeof window !== 'undefined') && !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if (isCoarse || cssW < 1000) return;

    // Only above 5 km
    if (altitude < 5_000) return;

    // Spawn at interval
    if ((nowMs - this.lastSpawnMs) / 1000 >= this.nextIntervalSec) {
      const idx = this.pickNextFactIndex();
      if (idx !== null) {
        const text = (spaceFacts as unknown as string[])[idx];
        this.shownFacts.add(idx);
        this.saveShownFacts();
        const x = Math.round(this.canvas.width / 2);
        const y = 60; // top center
        this.bubbles.push({ text, pos: new Vector2(x, y), bornAtMs: nowMs, ttlSec: 12 + Math.random() * 4, opacity: 0 });
        this.lastSpawnMs = nowMs;
        this.nextIntervalSec = 20 + Math.random() * 25;
      }
    }

    // Update lifetimes/opacities
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      const age = (nowMs - b.bornAtMs) / 1000;
      const t = age / b.ttlSec;
      // Ease in/out
      b.opacity = Math.max(0, Math.min(1, t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 1));
      if (age >= b.ttlSec) this.bubbles.splice(i, 1);
    }
  }

  render(): void {
    if (this.bubbles.length === 0) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const b of this.bubbles) {
      const panelW = 360;
      const panelH = 120;
      const x = b.pos.x - panelW / 2;
      const y = b.pos.y - panelH / 2;

      // Panel
      ctx.globalAlpha = b.opacity;
      ctx.fillStyle = 'rgba(18,22,34,0.92)';
      ctx.strokeStyle = '#88aaff';
      ctx.lineWidth = 1;
      ctx.fillRect(x, y, panelW, panelH);
      ctx.strokeRect(x, y, panelW, panelH);

      // Text
      ctx.globalAlpha = b.opacity;
      ctx.fillStyle = '#e6ecff';
      ctx.font = '13px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const pad = 12;
      const maxW = panelW - pad * 2;
      const lines = this.wrap(ctx, b.text, maxW);
      let ty = y + pad;
      for (const ln of lines) { ctx.fillText(ln, x + pad, ty); ty += 16; }

      // Progress bar
      const age = (Date.now() - b.bornAtMs) / 1000;
      const t = Math.max(0, Math.min(1, age / b.ttlSec));
      const barW = panelW - pad * 2;
      const barX = x + pad;
      const barY = y + panelH - pad - 10;
      ctx.globalAlpha = 0.8 * b.opacity;
      ctx.fillStyle = '#2a3350';
      ctx.fillRect(barX, barY, barW, 8);
      ctx.fillStyle = '#66aaff';
      ctx.fillRect(barX, barY, barW * (1 - t), 8);
    }
    ctx.restore();
  }

  private wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  private pickNextFactIndex(): number | null {
    const factsArr: string[] = (spaceFacts as unknown as string[]);
    const available: number[] = [];
    for (let i = 0; i < factsArr.length; i++) {
      if (!this.shownFacts.has(i)) available.push(i);
    }
    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
  }

  private loadShownFacts(): void {
    try {
      const s = localStorage.getItem('shownFacts');
      if (s) this.shownFacts = new Set(JSON.parse(s));
    } catch {}
  }
  private saveShownFacts(): void {
    try { localStorage.setItem('shownFacts', JSON.stringify([...this.shownFacts])); } catch {}
  }
}


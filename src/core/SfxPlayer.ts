// Lightweight SFX player for one-shot sounds.
import { isSoundEnabled } from './Settings.js';

export class SfxPlayer {
  private ctx: AudioContext | null = null;
  private cache = new Map<string, AudioBuffer>();

  private async ensureCtx(): Promise<AudioContext> {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch {} }
    return this.ctx;
  }

  private async loadBuffer(url: string): Promise<AudioBuffer> {
    if (this.cache.has(url)) return this.cache.get(url)!;
    const ctx = await this.ensureCtx();
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr);
    this.cache.set(url, buf);
    return buf;
  }

  async play(url: string, volume = 1.0): Promise<void> {
    if (!isSoundEnabled()) return; // muted
    const ctx = await this.ensureCtx();
    const buf = await this.loadBuffer(url);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, volume);
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    src.onended = () => {
      src.disconnect();
      gain.disconnect();
    };
  }
}

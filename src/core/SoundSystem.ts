// Simple engine sound system using Web Audio API.
// Plays a one-shot "start" segment, then loops the tail while engines are on.

export class SoundSystem {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private buffer: AudioBuffer | null = null;
  private initialSource: AudioBufferSourceNode | null = null;
  private loopSource: AudioBufferSourceNode | null = null;
  private tailGain: GainNode | null = null;
  private playing = false;
  private muted = false;

  // Loop after this time (seconds). The first part is the ignition blast.
  private readonly loopStart = 1.5;
  private readonly url: string;
  // Base gain multiplier (e.g., quieter second stage)
  private baseGain = 1.0;
  // Crossfade duration between loop iterations (seconds)
  private readonly xfade = 0.03;

  constructor(url: string) {
    this.url = url;
  }

  private async ensureContextAndBuffer(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch {}
    }
    if (!this.buffer) {
      const res = await fetch(this.url);
      const arr = await res.arrayBuffer();
      this.buffer = await this.ctx.decodeAudioData(arr);
    }
    if (!this.gain) {
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.ctx.destination);
    }
  }

  async startEngine(throttle: number): Promise<void> {
    await this.ensureContextAndBuffer();
    if (!this.ctx || !this.buffer || !this.gain) return;
    if (this.playing) { this.setThrottle(throttle); return; }

    // Create sources
    const now = this.ctx.currentTime;
    const startDur = Math.min(this.loopStart, this.buffer.duration);

    const initial = this.ctx.createBufferSource();
    initial.buffer = this.buffer;
    initial.loop = false;
    initial.connect(this.gain);
    // Play the start segment once
    initial.start(now, 0, startDur);

    this.initialSource = initial;
    this.playing = true;
    this.setThrottle(throttle);

    // When the initial segment ends, start manual tail looping with tiny crossfades
    initial.onended = () => {
      this.initialSource = null;
      this.scheduleTailLoop();
    };
  }

  setThrottle(throttle: number): void {
    if (!this.ctx || !this.gain) return;
    const enabled = !this.muted;
    const vol = (enabled ? 1 : 0) * this.baseGain * (0.2 + 0.8 * Math.max(0, Math.min(1, throttle)));
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(vol, t, 0.05);
  }

  stopEngine(): void {
    if (!this.ctx || !this.gain) return;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(0, t, 0.05);
    // Give a short fade-out, then stop sources
    const stopAt = t + 0.2;
    if (this.initialSource) {
      try { this.initialSource.stop(stopAt); } catch {}
      this.initialSource.disconnect();
      this.initialSource = null;
    }
    if (this.loopSource) {
      try { this.loopSource.stop(stopAt); } catch {}
      this.loopSource.disconnect();
      this.loopSource = null;
    }
    this.playing = false;
  }

  setBaseGain(multiplier: number): void {
    this.baseGain = Math.max(0, multiplier);
    // Apply immediately if running
    if (this.ctx && this.gain) {
      this.setThrottle(0); // will be overwritten by the next throttle set, but forces gain curve
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.setThrottle(0); // refresh gain curve
  }

  private scheduleTailLoop(): void {
    if (!this.ctx || !this.buffer || !this.gain || !this.playing) return;
    const now = this.ctx.currentTime;
    const tailDur = Math.max(0.01, this.buffer.duration - this.loopStart);

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    // Per-tail gain for crossfade
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.connect(this.gain);
    src.connect(g);
    // Start at loopStart, play to end
    src.start(now, this.loopStart, tailDur);

    // Schedule the next iteration slightly before this one ends (crossfade)
    const nextStart = now + tailDur - this.xfade;
    src.onended = () => {
      // No-op; cleanup happens when replaced
    };
    // Fade-in new tail
    g.gain.linearRampToValueAtTime(1, now + this.xfade);

    // Fade-out previous tail (if any) and stop it
    if (this.tailGain && this.loopSource) {
      const oldGain = this.tailGain;
      const oldSrc = this.loopSource;
      oldGain.gain.cancelScheduledValues(now);
      oldGain.gain.setValueAtTime(oldGain.gain.value, now);
      oldGain.gain.linearRampToValueAtTime(0, now + this.xfade);
      try { oldSrc.stop(now + this.xfade + 0.005); } catch {}
    }

    this.loopSource = src;
    this.tailGain = g;

    // Use a timer to schedule next tail. This keeps code simple and robust enough for our use.
    setTimeout(() => {
      if (!this.playing) return;
      // Short fade-out on the old source while new one fades in
      this.scheduleTailLoop();
    }, Math.max(1, (tailDur - this.xfade) * 1000));
  }

  // Optional: free resources
  async dispose(): Promise<void> {
    this.stopEngine();
    if (this.ctx) {
      try { await this.ctx.close(); } catch {}
      this.ctx = null;
    }
    this.buffer = null;
    this.gain = null;
  }
}

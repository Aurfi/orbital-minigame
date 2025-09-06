// Plays a start clip then a continuous loop with crossfades. Supports mute,
// per-stage base gain, and space muffle via lowpass filter and attenuation.
export class SoundSystem {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;       // master gain
  private filter: BiquadFilterNode | null = null; // lowpass for muffle
  private startBuffer: AudioBuffer | null = null;
  private loopBuffer: AudioBuffer | null = null;
  private startSource: AudioBufferSourceNode | null = null;
  private loopSource: AudioBufferSourceNode | null = null;
  private startGain: GainNode | null = null;
  private loopGain: GainNode | null = null;
  private playing = false;
  private muted = false;
  private envAtten = 1.0;

  private readonly startUrl: string;
  private readonly loopUrl: string;
  private baseGain = 1.0; // stage-dependent base gain
  private readonly xfade = 0.03; // for short fades

  constructor(startUrl: string, loopUrl: string) {
    this.startUrl = startUrl;
    this.loopUrl = loopUrl;
  }

  private async ensureContextAndBuffers(): Promise<void> {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch {} }
    if (!this.startBuffer) {
      const res = await fetch(this.startUrl); const arr = await res.arrayBuffer();
      this.startBuffer = await this.ctx.decodeAudioData(arr);
    }
    if (!this.loopBuffer) {
      const res = await fetch(this.loopUrl); const arr = await res.arrayBuffer();
      this.loopBuffer = await this.ctx.decodeAudioData(arr);
    }
    if (!this.gain) {
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 6000;
      this.filter.Q.value = 0.7;
      this.filter.connect(this.gain);
      this.gain.connect(this.ctx.destination);
    }
  }

  async startEngine(throttle: number, startLoudness = 1.0): Promise<void> {
    await this.ensureContextAndBuffers();
    if (!this.ctx || !this.startBuffer || !this.loopBuffer || !this.filter || !this.gain) return;
    if (this.playing) { this.setThrottle(throttle); return; }

    const now = this.ctx.currentTime;

    // Start clip
    const sSrc = this.ctx.createBufferSource();
    sSrc.buffer = this.startBuffer;
    const sGain = this.ctx.createGain();
    sGain.gain.setValueAtTime(Math.max(0, startLoudness), now);
    sSrc.connect(sGain); sGain.connect(this.filter);
    sSrc.start(now);

    // Loop clip (continuous)
    const lSrc = this.ctx.createBufferSource();
    lSrc.buffer = this.loopBuffer; lSrc.loop = true;
    const lGain = this.ctx.createGain();
    lGain.gain.setValueAtTime(0, now);
    lSrc.connect(lGain); lGain.connect(this.filter);

    // Crossfade between end of start and loop
    const startDur = this.startBuffer.duration;
    const merge = Math.min(0.25, Math.max(0.08, this.xfade * 12));
    const loopStartAt = now + Math.max(0, startDur - merge);
    lSrc.start(loopStartAt);
    lGain.gain.linearRampToValueAtTime(1, loopStartAt + merge);
    sGain.gain.setValueAtTime(sGain.gain.value, loopStartAt);
    sGain.gain.linearRampToValueAtTime(0, loopStartAt + merge);

    this.startSource = sSrc; this.startGain = sGain;
    this.loopSource = lSrc; this.loopGain = lGain;
    this.playing = true;
    this.setThrottle(throttle);

    sSrc.onended = () => { this.startSource = null; this.startGain = null; };
  }

  setThrottle(throttle: number): void {
    if (!this.ctx || !this.gain) return;
    const enabled = !this.muted;
    const vol = (enabled ? 1 : 0) * this.envAtten * this.baseGain * (0.2 + 0.8 * Math.max(0, Math.min(1, throttle)));
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(vol, t, 0.05);
  }

  stopEngine(): void {
    if (!this.ctx || !this.gain) return;
    const t = this.ctx.currentTime;
    // Gentle lowpass sweep + fade for nice stop
    if (this.filter) {
      try {
        this.filter.frequency.cancelScheduledValues(t);
        this.filter.frequency.setValueAtTime(this.filter.frequency.value, t);
        this.filter.frequency.linearRampToValueAtTime(400, t + 0.25);
      } catch {}
    }
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(0, t, 0.15);
    const stopAt = t + 0.4;
    if (this.startSource) { try { this.startSource.stop(stopAt); } catch {} this.startSource.disconnect(); this.startSource = null; }
    if (this.loopSource) { try { this.loopSource.stop(stopAt); } catch {} this.loopSource.disconnect(); this.loopSource = null; }
    this.playing = false;
  }

  setBaseGain(multiplier: number): void {
    this.baseGain = Math.max(0, multiplier);
    if (this.ctx && this.gain) this.setThrottle(0);
  }

  setMuted(m: boolean): void {
    this.muted = m; this.setThrottle(0);
  }

  // Apply atmospheric muffle: densityNorm in [0..1]
  setEnvironmentByDensity(densityNorm: number): void {
    if (!this.ctx || !this.filter) return;
    const dn = Math.max(0, Math.min(1, densityNorm));
    this.envAtten = 0.3 + 0.7 * Math.sqrt(dn);
    const cutoff = 800 + 5200 * Math.sqrt(dn);
    const t = this.ctx.currentTime;
    this.filter.frequency.cancelScheduledValues(t);
    this.filter.frequency.setTargetAtTime(cutoff, t, 0.1);
  }

  async dispose(): Promise<void> {
    this.stopEngine();
    if (this.ctx) { try { await this.ctx.close(); } catch {} this.ctx = null; }
    this.startBuffer = null; this.loopBuffer = null; this.gain = null; this.filter = null;
  }
}

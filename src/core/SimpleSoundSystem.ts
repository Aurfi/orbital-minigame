/**
 * Simple sound system for the game - handles 5 basic sounds:
 * 1. Game start
 * 2. Engine ignite/start
 * 3. Engine loop
 * 4. Explosion
 * 5. Success
 */
export class SimpleSoundSystem {
  private audioContext: AudioContext | null = null;
  private engineSource: AudioBufferSourceNode | null = null;
  private engineGain: GainNode | null = null;
  private engineLoopBuffer: AudioBuffer | null = null;
  private engineStartBuffer: AudioBuffer | null = null;
  private isEngineRunning = false;
  private enabled = true;

  constructor(enabled = true) {
    this.enabled = enabled;
    // Don't initialize audio until first user interaction
  }

  private async initAudio() {
    if (this.audioContext) return; // Already initialized

    try {
      const AudioContextClass =
        (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        console.warn('Web Audio API not supported');
        this.enabled = false;
        return;
      }
      this.audioContext = new AudioContextClass();

      // Pre-load engine sounds for smoother gameplay
      this.engineStartBuffer = await this.loadSound('sounds/rocket-launch-306441.mp3');
      this.engineLoopBuffer = await this.loadSound(
        'sounds/fx-looking-straight-into-a-burning-rocket-engine-283448.mp3'
      );
    } catch (e) {
      console.warn('Failed to initialize audio:', e);
      this.enabled = false;
    }
  }

  private async loadSound(url: string): Promise<AudioBuffer | null> {
    if (!this.audioContext || !this.enabled) return null;

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      return audioBuffer;
    } catch (e) {
      console.warn(`Failed to load sound ${url}:`, e);
      return null;
    }
  }

  private async ensureContext() {
    if (!this.audioContext || !this.enabled) return false;

    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.warn('Failed to resume audio context:', e);
        return false;
      }
    }
    return true;
  }

  async playGameStart() {
    await this.initAudio(); // Ensure audio is initialized
    if (!(await this.ensureContext())) return;

    try {
      const buffer = await this.loadSound('sounds/game-start-6104.mp3');
      if (!buffer || !this.audioContext) return;

      const source = this.audioContext.createBufferSource();
      const gain = this.audioContext.createGain();

      source.buffer = buffer;
      gain.gain.value = 0.5;

      source.connect(gain);
      gain.connect(this.audioContext.destination);
      source.start();
    } catch (e) {
      console.warn('Failed to play game start sound:', e);
    }
  }

  async playEngineIgnite() {
    await this.initAudio(); // Ensure audio is initialized
    if (!(await this.ensureContext())) return;

    try {
      if (!this.engineStartBuffer || !this.audioContext) return;

      const source = this.audioContext.createBufferSource();
      const gain = this.audioContext.createGain();

      source.buffer = this.engineStartBuffer;
      gain.gain.value = 0.6;

      source.connect(gain);
      gain.connect(this.audioContext.destination);
      source.start();

      // Start the engine loop after a short delay
      setTimeout(() => this.startEngineLoop(0.5), 500);
    } catch (e) {
      console.warn('Failed to play engine ignite sound:', e);
    }
  }

  private async startEngineLoop(throttle = 0.5) {
    if (!(await this.ensureContext())) return;
    if (this.isEngineRunning || !this.engineLoopBuffer || !this.audioContext) return;

    try {
      this.engineSource = this.audioContext.createBufferSource();
      this.engineGain = this.audioContext.createGain();

      this.engineSource.buffer = this.engineLoopBuffer;
      this.engineSource.loop = true;
      this.engineGain.gain.value = throttle * 0.7;

      this.engineSource.connect(this.engineGain);
      this.engineGain.connect(this.audioContext.destination);
      this.engineSource.start();

      this.isEngineRunning = true;
    } catch (e) {
      console.warn('Failed to start engine loop sound:', e);
    }
  }

  setEngineThrottle(throttle: number) {
    if (!this.engineGain || !this.isEngineRunning || !this.audioContext) return;

    try {
      const targetGain = Math.max(0, Math.min(1, throttle)) * 0.7;
      this.engineGain.gain.linearRampToValueAtTime(targetGain, this.audioContext.currentTime + 0.1);
    } catch (e) {
      console.warn('Failed to set engine throttle:', e);
    }
  }

  stopEngine() {
    if (!this.isEngineRunning || !this.engineSource) return;

    try {
      this.engineSource.stop();
      this.engineSource.disconnect();
      if (this.engineGain) {
        this.engineGain.disconnect();
      }
    } catch (e) {
      console.warn('Failed to stop engine:', e);
    } finally {
      this.engineSource = null;
      this.engineGain = null;
      this.isEngineRunning = false;
    }
  }

  async playExplosion() {
    if (!(await this.ensureContext())) return;

    try {
      const buffer = await this.loadSound('sounds/nuclear-explosion-386181.mp3');
      if (!buffer || !this.audioContext) return;

      const source = this.audioContext.createBufferSource();
      const gain = this.audioContext.createGain();

      source.buffer = buffer;
      gain.gain.value = 0.6;

      source.connect(gain);
      gain.connect(this.audioContext.destination);
      source.start();

      // Stop engine if it's running
      this.stopEngine();
    } catch (e) {
      console.warn('Failed to play explosion sound:', e);
    }
  }

  async playSuccess() {
    if (!(await this.ensureContext())) return;

    try {
      const buffer = await this.loadSound('sounds/success-340660.mp3');
      if (!buffer || !this.audioContext) return;

      const source = this.audioContext.createBufferSource();
      const gain = this.audioContext.createGain();

      source.buffer = buffer;
      gain.gain.value = 0.6;

      source.connect(gain);
      gain.connect(this.audioContext.destination);
      source.start();
    } catch (e) {
      console.warn('Failed to play success sound:', e);
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.stopEngine();
    }
  }

  dispose() {
    this.stopEngine();
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {
        console.warn('Failed to close audio context:', e);
      }
      this.audioContext = null;
    }
  }
}

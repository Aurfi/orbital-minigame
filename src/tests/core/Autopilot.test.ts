import { Autopilot, type AutopilotEnginePort } from '@/core/Autopilot';
import { describe, expect, it, vi } from 'vitest';

class FakeEngine implements AutopilotEnginePort {
  public throttle = 0;
  public holds: string[] = [];
  public commands: string[] = [];
  private apo = 0;

  setThrottle(v: number) {
    this.throttle = v;
    this.commands.push(`throttle:${v}`);
  }
  igniteEngines() {
    this.commands.push('ignite');
  }
  cutEngines() {
    this.commands.push('cut');
  }
  performStaging(): void {
    this.commands.push('stage');
  }
  setAutopilotHold(mode: 'none' | 'prograde' | 'retrograde' | 'up') {
    this.holds.push(mode);
    this.commands.push(`hold:${mode}`);
  }
  setAutopilotTargetAngle(_deg: number) {
    this.commands.push('pitch');
  }
  isEngineOn() {
    return this.throttle > 0;
  }
  getCurrentTWR() {
    return 1.5;
  }
  getRadialVelocity() {
    return -1;
  }
  getAltitude() {
    return 50000;
  }
  getActiveStageFuel() {
    return 0;
  }
  setGameSpeed(_s: number) {}
  getApoapsisAltitude() {
    return this.apo;
  }
  getPeriapsisAltitude() {
    return 100000;
  }
  // test helper
  bumpApo(val: number) {
    this.apo = val;
  }
}

describe('Autopilot parsing and steps', () => {
  it('parses basic throttle/ignite/cut commands', () => {
    const eng = new FakeEngine();
    const ap = new Autopilot(eng);
    const logger = vi.fn();
    ap.setLogger(logger);
    ap.runCommand('ignite throttle 0.5 cut');
    // Update tick should process steps sequentially
    for (let i = 0; i < 3; i++) ap.update(0.016);
    // The autopilot appends a final 'hold:none' on completion; assert the ordered prefix
    expect(eng.commands.slice(0, 3)).toEqual(['ignite', 'throttle:0.5', 'cut']);
  });

  it('supports pitch and hold modes', () => {
    const eng = new FakeEngine();
    const ap = new Autopilot(eng);
    ap.runCommand('hold prograde pitch east 5');
    ap.update(0.016);
    ap.update(0.016);
    expect(eng.holds).toContain('prograde');
    expect(eng.commands).toContain('pitch');
  });

  it('runs until apoapsis target then cuts throttle', () => {
    const eng = new FakeEngine();
    const ap = new Autopilot(eng);
    ap.runCommand('ignite throttle 1 until apoapsis = 100000 throttle 0');
    // Simulate apoapsis growing over updates
    for (let t = 0; t < 200; t++) {
      if (t === 50) eng.bumpApo(80000);
      if (t === 80) eng.bumpApo(120000); // cross target and increase
      ap.update(0.016);
    }
    // Expect ignite, throttle 1, then eventually throttle 0
    expect(eng.commands[0]).toBe('ignite');
    expect(eng.commands).toContain('throttle:1');
    expect(eng.commands).toContain('throttle:0');
  });
});

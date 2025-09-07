import { Autopilot, type AutopilotEnginePort } from '@/core/Autopilot';
import { describe, expect, it, vi } from 'vitest';

class EngineSim implements AutopilotEnginePort {
  public throttle = 0;
  private alt = 0;
  private fuel = 10;
  public calls: string[] = [];
  setThrottle(v: number) {
    this.throttle = v;
    this.calls.push(`throttle:${v}`);
  }
  igniteEngines() {
    this.calls.push('ignite');
  }
  cutEngines() {
    this.calls.push('cut');
  }
  performStaging(): void {
    this.calls.push('stage');
  }
  setAutopilotHold(_m: 'none' | 'prograde' | 'retrograde' | 'up') {}
  setAutopilotTargetAngle(_d: number) {}
  isEngineOn() {
    return this.throttle > 0;
  }
  getCurrentTWR() {
    return 2.0;
  }
  getRadialVelocity() {
    return -1;
  }
  getAltitude() {
    return this.alt;
  }
  getActiveStageFuel() {
    return this.fuel;
  }
  setGameSpeed(_s: number) {}
  getApoapsisAltitude() {
    return 0;
  }
  getPeriapsisAltitude() {
    return 100000;
  }
  // helpers
  step() {
    if (this.throttle > 0) {
      this.alt += 2000;
      this.fuel = Math.max(0, this.fuel - 1);
    }
  }
}

describe('Autopilot parsing (extended)', () => {
  it('logs error for unknown command', () => {
    const e = new EngineSim();
    const ap = new Autopilot(e);
    const logs: string[] = [];
    ap.setLogger((m) => logs.push(m));
    ap.runCommand('foobar');
    ap.update(0.016);
    expect(logs.some((l) => /ERR:/i.test(l))).toBe(true);
  });

  it('wait until altitude completes when threshold reached', () => {
    const e = new EngineSim();
    const ap = new Autopilot(e);
    ap.runCommand('ignite throttle 1 wait until altitude 6000 throttle 0');
    for (let i = 0; i < 10; i++) {
      e.step();
      ap.update(0.016);
    }
    expect(e.calls).toContain('throttle:0');
  });

  it('until twr sets throttle when condition checked', () => {
    const e = new EngineSim();
    const ap = new Autopilot(e);
    ap.runCommand('until twr >= 1.5 throttle 0.3');
    ap.update(0.016); // processes the 'until twr' step
    ap.update(0.016); // processes the following 'throttle 0.3' step (split by parser)
    expect(e.throttle).toBeCloseTo(0.3, 6);
  });

  it('burn_until apoapsis respects throttle default', () => {
    const e = new EngineSim();
    const ap = new Autopilot(e);
    ap.runCommand('burn_until apoapsis 120000 throttle 1');
    ap.update(0.016);
    expect(e.calls).toContain('throttle:1');
  });
});

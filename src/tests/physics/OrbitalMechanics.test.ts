import {
  calculateApoapsis,
  calculateCircularVelocity,
  calculateEscapeVelocity,
  calculatePeriapsis,
  getProgradeDirection,
  getRetrogradeDirection,
  isStableOrbit,
} from '@/physics/OrbitalMechanics';
import { Vector2 } from '@/physics/Vector2';
import { describe, expect, it } from 'vitest';

// Earth-like values used in the game
const mu = 3.986004418e14; // m^3/s^2
const radius = 6371000; // m

describe('OrbitalMechanics', () => {
  it('circular velocity matches v = sqrt(mu/r)', () => {
    const v = calculateCircularVelocity(radius + 100000, mu);
    expect(v).toBeCloseTo(Math.sqrt(mu / (radius + 100000)), 6);
  });

  it('escape velocity matches v = sqrt(2mu/r)', () => {
    const v = calculateEscapeVelocity(radius, mu);
    expect(v).toBeCloseTo(Math.sqrt((2 * mu) / radius), 6);
  });

  it('apoapsis/periapsis for simple ellipse are consistent', () => {
    // Position at perigee, set velocity for an ellipse
    const r0 = new Vector2(radius + 200000, 0);
    // At perigee, speed > circular; choose 5% above circular to get an ellipse
    const vCirc = Math.sqrt(mu / r0.magnitude());
    const v0 = new Vector2(0, vCirc * 1.05);
    const ap = calculateApoapsis(r0, v0, mu, radius);
    const pe = calculatePeriapsis(r0, v0, mu, radius);
    expect(ap).toBeGreaterThan(0);
    // Periapsis should be near our current altitude (~200km)
    expect(pe).toBeGreaterThan(150000);
    expect(pe).toBeLessThan(250000);
    expect(ap).toBeGreaterThan(pe);
  });

  it('stable orbit predicate rejects escape and low periapsis', () => {
    expect(isStableOrbit(Number.POSITIVE_INFINITY, 100000, 0)).toBe(false);
    expect(isStableOrbit(200000, 1000, 0)).toBe(false);
  });

  it('prograde/retrograde directions are unit and opposite', () => {
    const v = new Vector2(3, 4);
    const pro = getProgradeDirection(v);
    const retro = getRetrogradeDirection(v);
    expect(pro.magnitude()).toBeCloseTo(1, 6);
    expect(retro.magnitude()).toBeCloseTo(1, 6);
    expect(pro.add(retro).magnitude()).toBeCloseTo(0, 6);
  });
});

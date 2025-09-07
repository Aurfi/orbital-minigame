import { describe, it, expect } from 'vitest';
import { OrbitalMechanics } from '@/physics/OrbitalMechanics';
import { Vector2 } from '@/physics/Vector2';

// Earth-like values used in the game
const mu = 3.986004418e14; // m^3/s^2
const radius = 6371000; // m

describe('OrbitalMechanics', () => {
  it('circular velocity matches v = sqrt(mu/r)', () => {
    const v = OrbitalMechanics.calculateCircularVelocity(radius + 100000, mu);
    expect(v).toBeCloseTo(Math.sqrt(mu / (radius + 100000)), 6);
  });

  it('escape velocity matches v = sqrt(2mu/r)', () => {
    const v = OrbitalMechanics.calculateEscapeVelocity(radius, mu);
    expect(v).toBeCloseTo(Math.sqrt((2 * mu) / radius), 6);
  });

  it('apoapsis/periapsis for simple ellipse are consistent', () => {
    // Position at perigee, set velocity for an ellipse
    const r0 = new Vector2(radius + 200000, 0);
    // At perigee, speed > circular; choose 5% above circular to get an ellipse
    const vCirc = Math.sqrt(mu / r0.magnitude());
    const v0 = new Vector2(0, vCirc * 1.05);
    const ap = OrbitalMechanics.calculateApoapsis(r0, v0, mu, radius);
    const pe = OrbitalMechanics.calculatePeriapsis(r0, v0, mu, radius);
    expect(ap).toBeGreaterThan(0);
    // Periapsis should be near our current altitude (~200km)
    expect(pe).toBeGreaterThan(150000);
    expect(pe).toBeLessThan(250000);
    expect(ap).toBeGreaterThan(pe);
  });

  it('stable orbit predicate rejects escape and low periapsis', () => {
    expect(OrbitalMechanics.isStableOrbit(Number.POSITIVE_INFINITY, 100000, 0)).toBe(false);
    expect(OrbitalMechanics.isStableOrbit(200000, 1000, 0)).toBe(false);
  });
});

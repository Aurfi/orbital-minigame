import {
  calculateDensity,
  calculateDragForce,
  calculateDynamicPressure,
  calculateHeatFlux,
  calculateTerminalVelocity,
  isOverheating,
  isOverpressure,
} from '@/physics/AtmosphericPhysics';
import { Vector2 } from '@/physics/Vector2';
import { describe, expect, it } from 'vitest';

describe('AtmosphericPhysics', () => {
  it('density decreases exponentially with altitude', () => {
    const rho0 = 1.225; // kg/m^3 sea level
    const H = 8500; // m
    const rho1 = calculateDensity(0, rho0, H);
    const rho2 = calculateDensity(8500, rho0, H);
    expect(rho2).toBeLessThan(rho1);
    expect(rho1).toBeCloseTo(rho0, 6);
  });

  it('drag force opposes velocity and scales with v^2', () => {
    const v = new Vector2(10, 0);
    const d1 = calculateDragForce(v, 1.2, 0.5, 1);
    const d2 = calculateDragForce(v.multiply(2), 1.2, 0.5, 1);
    // Opposite direction
    expect(Math.sign(d1.x)).toBe(-1);
    expect(Math.abs(d1.y)).toBeLessThan(1e-12);
    // Quadruple when speed doubles
    expect(d2.x / d1.x).toBeCloseTo(4, 5);
  });

  it('dynamic pressure and heat flux increase with speed', () => {
    const rho = 0.8;
    const v1 = new Vector2(100, 0);
    const v2 = new Vector2(200, 0);
    const q1 = calculateDynamicPressure(v1, rho);
    const q2 = calculateDynamicPressure(v2, rho);
    const h1 = calculateHeatFlux(v1, rho);
    const h2 = calculateHeatFlux(v2, rho);
    expect(q2).toBeGreaterThan(q1);
    expect(h2).toBeGreaterThan(h1);
  });

  it('overpressure/overheating predicates', () => {
    const v = new Vector2(300, 0);
    const rho = 1.0;
    const q = calculateDynamicPressure(v, rho);
    expect(isOverpressure(q, q / 2)).toBe(true);
    expect(isOverheating(60_000)).toBe(true);
  });

  it('terminal velocity returns Infinity when density is zero', () => {
    const vt = calculateTerminalVelocity(1000, 0, 0.5, 1, 9.81);
    expect(vt).toBe(Number.POSITIVE_INFINITY);
  });
});

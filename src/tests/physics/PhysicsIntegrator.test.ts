import { PhysicsIntegrator } from '@/physics/PhysicsIntegrator';
import { Vector2 } from '@/physics/Vector2';
import { describe, expect, it } from 'vitest';

// Use real Vector2 for type compatibility

describe('PhysicsIntegrator', () => {
  it('integrateMotion uses semi-implicit Euler and average velocity for position', () => {
    const p = new Vector2(0, 0);
    const v = new Vector2(10, 0);
    const a = new Vector2(0, 10);
    PhysicsIntegrator.integrateMotion(p, v, a, 1);
    // v should be (10,10), position advanced by average velocity ( (10,0)+(10,10) )/2 = (10,5)
    expect(v.x).toBeCloseTo(10, 6);
    expect(v.y).toBeCloseTo(10, 6);
    expect(p.x).toBeCloseTo(10, 6);
    expect(p.y).toBeCloseTo(5, 6);
  });

  it('isStable guards extreme values', () => {
    const ok = PhysicsIntegrator.isStable(new Vector2(100, 0), new Vector2(1, 0), 1 / 60);
    const badVel = PhysicsIntegrator.isStable(new Vector2(100000, 0), new Vector2(1, 0), 1 / 60);
    const badAcc = PhysicsIntegrator.isStable(new Vector2(0, 0), new Vector2(2000, 0), 1 / 60);
    expect(ok).toBe(true);
    expect(badVel).toBe(false);
    expect(badAcc).toBe(false);
  });

  it('getRecommendedTimestep halves for high velocity/acceleration', () => {
    const base = PhysicsIntegrator.getRecommendedTimestep(new Vector2(0, 0), new Vector2(0, 0));
    const half = PhysicsIntegrator.getRecommendedTimestep(new Vector2(20000, 0), new Vector2(0, 0));
    expect(half).toBeLessThan(base);
    expect(half).toBeCloseTo(base * 0.5, 6);
  });
});

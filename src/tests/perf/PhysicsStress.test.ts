import { PhysicsIntegrator } from '@/physics/PhysicsIntegrator';
import { Vector2 } from '@/physics/Vector2';
import { describe, expect, it } from 'vitest';

// Run only when PERF=1 to avoid flaky CI timing assertions
const PERF = process.env.PERF === '1';

(PERF ? describe : describe.skip)('Stress: simple gravity integration', () => {
  it('runs thousands of steps without NaNs or instability', () => {
    // Earth-like mu and radius
    const mu = 3.986004418e14;
    const radius = 6371e3;
    const dt = 1 / 120; // small step

    const p = new Vector2(radius + 120e3, 0);
    const v = new Vector2(0, Math.sqrt(mu / p.magnitude())); // circular

    for (let i = 0; i < 10000; i++) {
      const r = p.magnitude();
      const invr3 = 1 / (r * r * r);
      const ax = -mu * p.x * invr3;
      const ay = -mu * p.y * invr3;
      PhysicsIntegrator.integrateMotion(p, v, new Vector2(ax, ay), dt);
      // Sanity checks
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Number.isFinite(v.y)).toBe(true);
    }
  });
});

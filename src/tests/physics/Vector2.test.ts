import { describe, it, expect } from 'vitest';
import { Vector2 } from '@/physics/Vector2';

describe('Vector2', () => {
  it('adds, subtracts, multiplies, divides', () => {
    const a = new Vector2(3, -4);
    const b = new Vector2(1, 2);
    expect(a.add(b)).toEqual(new Vector2(4, -2));
    expect(a.subtract(b)).toEqual(new Vector2(2, -6));
    expect(a.multiply(2)).toEqual(new Vector2(6, -8));
    expect(a.divide(2)).toEqual(new Vector2(1.5, -2));
  });

  it('magnitude and normalization', () => {
    const v = new Vector2(3, 4);
    expect(v.magnitude()).toBeCloseTo(5, 10);
    const n = v.normalized();
    expect(n.magnitude()).toBeCloseTo(1, 10);
    expect(n.x).toBeCloseTo(3 / 5, 10);
    expect(n.y).toBeCloseTo(4 / 5, 10);
  });

  it('angle and angleTo', () => {
    const x = new Vector2(1, 0);
    const y = new Vector2(0, 1);
    expect(x.angle()).toBeCloseTo(0, 10);
    expect(y.angle()).toBeCloseTo(Math.PI / 2, 10);
    expect(x.angleTo(y)).toBeCloseTo(Math.PI / 2, 10);
  });

  it('equals with tolerance', () => {
    const a = new Vector2(1, 1);
    const b = new Vector2(1 + 1e-11, 1 - 1e-11);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(new Vector2(1.0001, 1))).toBe(false);
  });
});


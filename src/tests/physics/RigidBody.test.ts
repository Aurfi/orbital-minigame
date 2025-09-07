import { RigidBody } from '@/physics/RigidBody';
import { Vector2 } from '@/physics/Vector2';
import { describe, expect, it } from 'vitest';

describe('RigidBody', () => {
  it('applies force and integrates linear motion', () => {
    const rb = new RigidBody(new Vector2(0, 0), new Vector2(0, 0), 10);
    // Apply 10N upward for two 0.5s steps (a = 1 m/s^2)
    rb.applyForce(new Vector2(0, 10));
    rb.integrate(0.5);
    rb.applyForce(new Vector2(0, 10));
    rb.integrate(0.5);
    // Expect v ≈ 1 m/s up, position around 0.5 m
    expect(rb.velocity.y).toBeCloseTo(1, 5);
    expect(rb.position.y).toBeGreaterThan(0.48);
    expect(rb.position.y).toBeLessThan(0.52);
  });

  it('applies torque via force at point and rotates', () => {
    const rb = new RigidBody(new Vector2(0, 0), new Vector2(0, 0), 10);
    // Force to the right applied at a point above CoM -> clockwise torque
    rb.applyForceAtPoint(new Vector2(10, 0), new Vector2(0, 1));
    rb.integrate(0.5, 100); // inertia 100, stable dt
    expect(Math.abs(rb.angularVelocity)).toBeGreaterThan(0);
    expect(Math.abs(rb.rotation)).toBeGreaterThan(0);
  });
});

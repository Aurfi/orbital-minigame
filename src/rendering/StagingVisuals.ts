import { Vector2 } from '@/physics/Vector2';
import type { CanvasRenderer } from '@/rendering/CanvasRenderer';

// Visual helpers for debris, smoke and explosions.
// Idea: keep rendering/state here so GameEngine stays smaller.
export class StagingVisuals {
  // debris from stage separation
  private debris: Array<{
    pos: Vector2;
    vel: Vector2;
    rotation: number;
    rotSpeed: number;
    life: number;
  }> = [];
  // simple smoke puffs
  private smoke: Array<{
    pos: Vector2;
    vel: Vector2;
    life: number;
    maxLife: number;
    size: number;
  }> = [];
  // cartoon explosions
  private explosions: Array<{
    pos: Vector2;
    vel: Vector2;
    life: number;
    maxLife: number;
    size: number;
    particles: Array<{ pos: Vector2; vel: Vector2; color: string; size: number }>;
  }> = [];

  // spawn one debris piece
  addDebris(pos: Vector2, vel: Vector2, rot: number, rotSpeed: number, life = 6): void {
    this.debris.push({ pos: pos.clone(), vel: vel.clone(), rotation: rot, rotSpeed, life });
    if (this.debris.length > 80) this.debris.shift(); // hard cap
  }

  // add a light smoke puff
  addSmoke(pos: Vector2, vel: Vector2, size = 8, life = 1.8): void {
    this.smoke.push({ pos: pos.clone(), vel: vel.clone(), life: 0, maxLife: life, size });
    if (this.smoke.length > 120) this.smoke.splice(0, this.smoke.length - 120);
  }

  // create explosion at pos with small random particles
  createExplosion(pos: Vector2, vel: Vector2): void {
    const particles: Array<{ pos: Vector2; vel: Vector2; color: string; size: number }> = [];
    for (let i = 0; i < 30; i++) {
      const a = (Math.PI * 2 * i) / 30 + Math.random() * 0.2;
      const sp = 40 + Math.random() * 60;
      const pv = new Vector2(Math.cos(a) * sp + vel.x * 0.1, Math.sin(a) * sp + vel.y * 0.1);
      const c = i % 2 === 0 ? '#ffcc66' : '#ff6633';
      const sz = 2 + Math.random() * 3;
      particles.push({ pos: pos.clone(), vel: pv, color: c, size: sz });
    }
    this.explosions.push({
      pos: pos.clone(),
      vel: vel.clone(),
      life: 0,
      maxLife: 2.0,
      size: 16,
      particles,
    });
    if (this.explosions.length > 8) this.explosions.shift();
  }

  // update all visuals
  update(dt: number): void {
    // debris update
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.pos = d.pos.add(d.vel.multiply(dt));
      d.rotation += d.rotSpeed * dt;
      d.life -= dt;
      if (d.life <= 0) this.debris.splice(i, 1);
    }
    // smoke update
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i];
      s.life += dt;
      s.pos = s.pos.add(s.vel.multiply(dt));
      if (s.life >= s.maxLife) this.smoke.splice(i, 1);
    }
    // explosions update
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.life += dt;
      e.pos = e.pos.add(e.vel.multiply(dt));
      for (const p of e.particles) {
        p.pos = p.pos.add(p.vel.multiply(dt));
      }
      if (e.life >= e.maxLife) this.explosions.splice(i, 1);
    }
  }

  // draw elements meant to be behind the rocket (e.g., smoke)
  drawBehind(renderer: CanvasRenderer): void {
    // smoke (faded circles behind plume)
    for (const s of this.smoke) {
      const t = Math.max(0, Math.min(1, s.life / s.maxLife));
      const alpha = 1 - t;
      const size = s.size * (1 + t * 1.2);
      renderer.drawCircle(s.pos, size, `rgba(200,200,200,${alpha * 0.6})`);
    }
  }

  // draw elements meant to be in front of the rocket (debris/explosions)
  drawFront(renderer: CanvasRenderer): void {
    // debris (small rectangles)
    for (const d of this.debris) {
      renderer.drawRotated(d.pos, d.rotation, () => {
        renderer.drawRectangle(new Vector2(-2, -1), 4, 2, 'rgba(180,180,180,0.8)');
      });
    }
    // explosions
    for (const e of this.explosions) {
      const age = e.life / e.maxLife;
      for (const p of e.particles) {
        renderer.drawCircle(p.pos, p.size, p.color);
      }
      const flash = e.size * (1 + age * 2);
      const a = 1 - age;
      renderer.drawCircle(e.pos, flash, `rgba(255,220,160,${a})`);
    }
  }
}

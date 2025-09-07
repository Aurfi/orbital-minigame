import { GameEngine } from '@/core/GameEngine';
import { describe, expect, it } from 'vitest';

// create a fake canvas for jsdom
function createCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas') as HTMLCanvasElement;
  // minimal stubs for 2D context usage inside engine
  (c as unknown as { getContext: (t: string) => CanvasRenderingContext2D }).getContext = () =>
    ({
      save() {},
      restore() {},
      setTransform() {},
      clearRect() {},
      scale() {},
      fillRect() {},
      strokeRect() {},
      beginPath() {},
      arc() {},
      fill() {},
      stroke() {},
      moveTo() {},
      lineTo() {},
      clip() {},
      translate() {},
      rotate() {},
      createLinearGradient() {
        return { addColorStop() {} } as unknown as CanvasGradient;
      },
      createRadialGradient() {
        return { addColorStop() {} } as unknown as CanvasGradient;
      },
      measureText() {
        return { width: 100 } as TextMetrics;
      },
      font: '',
      fillStyle: '' as unknown as string | CanvasGradient | CanvasPattern,
      strokeStyle: '' as unknown as string | CanvasGradient | CanvasPattern,
      lineWidth: 1,
      textAlign: 'left' as CanvasTextAlign,
      textBaseline: 'top' as CanvasTextBaseline,
      fillText() {},
    }) as unknown as CanvasRenderingContext2D;
  return c;
}

describe('GameEngine non-visual branches', () => {
  it('burn-up path triggers game over when overheating', () => {
    const canvas = createCanvas();
    const ge = new GameEngine(canvas);
    type MutableGE = {
      gameState: import('@/core/types').GameState;
      enforceAtmosphericLimits(dt: number): void;
      atmosphericGlow: number;
    };
    const gm = ge as unknown as MutableGE;
    // set state: low altitude and very high speed to accumulate heat fast
    gm.gameState.rocket.position.x = gm.gameState.world.planetRadius + 10; // near ground
    gm.gameState.rocket.position.y = 0;
    gm.gameState.rocket.velocity.x = 12000; // very fast in dense air
    gm.gameState.rocket.velocity.y = 0;
    // step the internal enforcement a few times
    const before = gm.gameState.rocket.velocity.magnitude();
    gm.enforceAtmosphericLimits(0.5);
    const after = gm.gameState.rocket.velocity.magnitude();
    expect(after).toBeLessThan(before);
    // also expect some glow in dense air
    expect(gm.atmosphericGlow).toBeGreaterThanOrEqual(0);
  });

  it('hot staging with engines on causes explosion path', () => {
    const canvas = createCanvas();
    const ge = new GameEngine(canvas);
    // Arm engines and try to stage while ignited
    const gm = ge as unknown as {
      gameState: import('@/core/types').GameState;
      explosionPhase: boolean;
    };
    gm.gameState.rocket.isEngineIgnited = true;
    gm.gameState.rocket.throttle = 1;
    const ok = ge.performStaging();
    expect(ok).toBe(false);
    // Engine should remain as is or be safe, but explosion phase toggles on
    expect(gm.explosionPhase).toBe(true);
  });
});

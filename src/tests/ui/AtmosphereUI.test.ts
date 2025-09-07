import { AtmosphereUI } from '@/ui/AtmosphereUI';
import { describe, expect, it } from 'vitest';

describe('AtmosphereUI', () => {
  const makeWorld = (planetRadius = 6_371_000) =>
    ({
      planetRadius,
      getAltitude: (r: number) => r - planetRadius,
    }) as unknown as import('@/physics/WorldParameters').WorldParameters;

  it('delays Troposphere message until >= 1 km', () => {
    const canvas = document.createElement('canvas');
    const ui = new AtmosphereUI(canvas);
    const world = makeWorld();
    const r0 = 6_371_000; // ground
    ui.checkLayers(world, r0, 0);
    expect(ui.getMessages().length).toBe(0);
    // below threshold
    ui.checkLayers(world, r0 + 900, 1);
    expect(ui.getMessages().length).toBe(0);
    // at/above threshold
    ui.checkLayers(world, r0 + 1_000, 2);
    const msgs = ui.getMessages();
    expect(msgs.length).toBe(1);
    expect(msgs[0].text).toBe("You're in the Troposphere !");
  });

  it('emits next layer message when crossing boundary', () => {
    const canvas = document.createElement('canvas');
    const ui = new AtmosphereUI(canvas);
    const world = makeWorld();

    // Cross 1km first so troposphere message is emitted
    ui.checkLayers(world, 6_371_000 + 1_200, 1);
    // Cross to 12 km (stratosphere starts at 11 km)
    ui.checkLayers(world, 6_371_000 + 12_000, 5);
    const msgs = ui.getMessages();
    expect(msgs.some((m) => /Troposphere/.test(m.text))).toBe(true);
    expect(msgs.some((m) => /Stratosphere/.test(m.text))).toBe(true);
  });

  it('expires messages after duration using update()', () => {
    const canvas = document.createElement('canvas');
    const ui = new AtmosphereUI(canvas);
    const world = makeWorld();
    ui.addMessage('test', 0, 1.0);
    ui.update(0.5);
    expect(ui.getMessages().length).toBe(1);
    ui.update(1.2);
    expect(ui.getMessages().length).toBe(0);
  });
});

import type { GameState } from '../core/types.js';
import { Vector2 } from '../physics/Vector2.js';
import type { CanvasRenderer } from './CanvasRenderer.js';

interface Building {
  position: Vector2;
  width: number;
  height: number;
  type: 'skyscraper' | 'mid' | 'low' | 'box';
  color: string;
}

interface TreeDef {
  offset: number; // lateral offset along tangent (meters)
  height: number; // meters
  width: number; // meters
  type: 'pine' | 'broadleaf';
}

export class BackgroundSystem {
  private buildings: Building[] = [];
  private buildingDefs: Array<{
    offset: number;
    width: number;
    height: number;
    type: Building['type'];
    color: string;
  }> = [];
  private buildingSprites: Array<{
    image: HTMLCanvasElement;
    offset: number;
    width: number;
    height: number;
  }> = [];
  private treeDefs: TreeDef[] = [];
  private treeSprites: Array<{
    image: HTMLCanvasElement;
    offset: number;
    width: number;
    height: number;
  }> = [];
  private spritesReady = false;
  private padBaseAngle: number | null = null; // world pad angle at t=0 (radians)

  constructor() {
    this.initializeBackground();
  }

  // Update only tracks pad base angle for building rotation
  update(gameState: GameState, deltaTime: number): void {
    // Seed pad base angle once, deriving the reference world angle for buildings.
    if (this.padBaseAngle === null) {
      const angleNow = Math.atan2(gameState.rocket.position.y, gameState.rocket.position.x);
      const omega = gameState.world.earthRotationRate || 0;
      this.padBaseAngle = angleNow - omega * gameState.currentTime;
    }
  }

  /**
   * Initialize static background elements
   */
  private initializeBackground(): void {
    // Create Kennedy Space Center style buildings (defs used relative to rocket)
    this.createLaunchFacilities();
    // Plant trees near the pad area (far enough not to overlap launch structures)
    this.createTrees();

    // Pre-render sprite atlases for buildings
    this.prepareSprites();
  }

  private prepareSprites(): void {
    // Building sprites from defs
    this.buildingSprites = [];
    for (const def of this.buildingDefs) {
      const img = document.createElement('canvas');
      const scale = 2; // pixels per world unit in sprite
      img.width = Math.max(2, Math.floor(def.width * scale));
      img.height = Math.max(2, Math.floor(def.height * scale));
      const ctx = img.getContext('2d');
      if (!ctx) {
        this.spritesReady = false;
        return;
      }
      // draw body
      ctx.fillStyle = def.color;
      ctx.fillRect(0, 0, img.width, img.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#556';
      ctx.strokeRect(0.5, 0.5, img.width - 1, img.height - 1);
      // details using same patterns as runtime but on offscreen context
      this.drawBuildingDetailsToCtx(ctx, def.width, def.height, def.type, scale);
      this.buildingSprites.push({
        image: img,
        offset: def.offset,
        width: def.width,
        height: def.height,
      });
    }

    this.spritesReady = true;
  }

  private createTrees(): void {
    this.treeDefs = [];
    const rng = () => Math.random();
    // Populate a few rows of trees left/right of the pad out to ~1 km
    const bands = [220, 320, 450, 620, 800, 1000];
    for (const band of bands) {
      const count = 6 + Math.floor(rng() * 6);
      for (let i = 0; i < count; i++) {
        const side = rng() < 0.5 ? -1 : 1;
        const jitter = (rng() - 0.5) * 60; // small offset so they aren't perfectly aligned
        const offset = side * (band + jitter);
        if (Math.abs(offset) < 180) continue; // keep clear zone around pad
        const type: TreeDef['type'] = rng() < 0.6 ? 'pine' : 'broadleaf';
        const height = type === 'pine' ? 30 + rng() * 18 : 22 + rng() * 14;
        const width = type === 'pine' ? height * 0.35 : height * 0.6;
        this.treeDefs.push({ offset, height, width, type });
      }
    }

    // Pre-render simple tree sprites (vector look kept coherent with buildings)
    this.treeSprites = this.treeDefs.map((t) => {
      const scale = 2;
      const w = Math.max(4, Math.floor(t.width * scale));
      const h = Math.max(6, Math.floor(t.height * scale));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return { image: c, offset: t.offset, width: t.width, height: t.height };
      ctx.clearRect(0, 0, w, h);
      if (t.type === 'pine') {
        // Trunk
        ctx.fillStyle = '#6d4c41';
        ctx.fillRect(
          w / 2 - Math.max(2, Math.floor(w * 0.06)),
          h * 0.75,
          Math.max(4, w * 0.12),
          h * 0.25
        );
        // Conical foliage
        ctx.fillStyle = '#2e7d32';
        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w * 0.1, h * 0.8);
        ctx.lineTo(w * 0.9, h * 0.8);
        ctx.closePath();
        ctx.fill();
      } else {
        // Trunk
        ctx.fillStyle = '#6d4c41';
        ctx.fillRect(
          w / 2 - Math.max(2, Math.floor(w * 0.06)),
          h * 0.7,
          Math.max(4, w * 0.12),
          h * 0.3
        );
        // Round canopy
        ctx.fillStyle = '#388e3c';
        ctx.beginPath();
        ctx.ellipse(w / 2, h * 0.55, w * 0.45, h * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return { image: c, offset: t.offset, width: t.width, height: t.height };
    });
  }

  private drawBuildingDetailsToCtx(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    type: Building['type'],
    scale: number
  ): void {
    const toPx = (x: number) => x * scale;
    switch (type) {
      case 'skyscraper': {
        ctx.fillStyle = '#c9dcf8';
        const stripeW = toPx(w * 0.22);
        const leftX = toPx(w * 0.18);
        const rightX = toPx(w - w * 0.18 - w * 0.22);
        ctx.fillRect(leftX, 0, stripeW, toPx(h));
        ctx.fillRect(rightX, 0, stripeW, toPx(h));
        // antenna
        ctx.strokeStyle = '#9aa7b7';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(toPx(w / 2), toPx(h));
        ctx.lineTo(toPx(w / 2), toPx(h) + toPx(h * 0.12));
        ctx.stroke();
        break;
      }
      case 'mid': {
        const cols = Math.max(4, Math.floor(w / 26));
        const rows = Math.max(3, Math.floor(h / 32));
        const winW = toPx(8);
        const winH = toPx(16);
        const gapX = (toPx(w) - cols * winW) / (cols + 1);
        const gapY = (toPx(h) - rows * winH) / (rows + 1);
        const baseX = gapX;
        const baseY = gapY;
        ctx.fillStyle = '#96b6ff';
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const wx = baseX + c * (winW + gapX);
            const wy = baseY + r * (winH + gapY);
            ctx.fillRect(wx, wy, winW, winH);
          }
        }
        break;
      }
      case 'low': {
        const vents = Math.max(3, Math.floor(w / 50));
        const vw = toPx(16);
        const vh = toPx(10);
        const gap = toPx(12);
        const total = vents * vw + (vents - 1) * gap;
        let x = (toPx(w) - total) / 2;
        const y = toPx(h) / 2 - vh / 2;
        ctx.fillStyle = '#9aa7b7';
        for (let i = 0; i < vents; i++) {
          ctx.fillRect(x, y, vw, vh);
          x += vw + gap;
        }
        break;
      }
      case 'box': {
        const cols = Math.max(3, Math.floor(w / 50));
        const winW = toPx(10);
        const winH = toPx(14);
        const gap = (toPx(w) - cols * winW) / (cols + 1);
        const baseX = gap;
        const baseY = toPx(h) / 2 - winH / 2;
        ctx.fillStyle = '#9fc3ff';
        for (let c = 0; c < cols; c++) {
          const wx = baseX + c * (winW + gap);
          ctx.fillRect(wx, baseY, winW, winH);
        }
        break;
      }
    }
  }

  /**
   * Create launch pad facilities
   */
  private createLaunchFacilities(): void {
    // Offsets are lateral along local ground tangent at the pad
    const add = (
      offset: number,
      width: number,
      height: number,
      type: Building['type'],
      color: string
    ) => {
      // Avoid drawing anything too close to the rocket/pad area
      if (Math.abs(offset) < 160) return;
      this.buildingDefs.push({ offset, width, height, type, color });
    };
    // Skyline inspired by the mock: bluish/white boxes with windows
    // Tall slender skyscraper with antenna
    add(-350, 100, 360, 'skyscraper', '#8fb7e9');
    // Light mid-rise with many windows
    add(-540, 220, 220, 'mid', '#e9eef6');
    // Small low box (vents)
    add(-240, 160, 70, 'low', '#bdbdbd');
    // White mid-rise on right with grid windows
    add(260, 260, 200, 'mid', '#f2f5fa');
    // Darker blue block behind
    add(430, 200, 230, 'mid', '#79a3e6');
    // Small light box
    add(560, 160, 90, 'low', '#cfd8dc');
    // Short framed box
    add(320, 180, 90, 'box', '#cfd8dc');
  }

  /**
   * Render all background elements
   */
  render(renderer: CanvasRenderer, gameState: GameState): void {
    if (!gameState || !gameState.rocket) return;
    const altitude = gameState.world.getAltitude(gameState.rocket.position.magnitude());

    // Render buildings
    if (altitude < 20000) {
      this.renderBuildings(renderer, gameState);
    }
  }

  /**
   * Render launch facilities and buildings
   */
  private renderBuildings(renderer: CanvasRenderer, gameState: GameState): void {
    // Base ground point at the fixed pad angle rotating with the planet
    const R = gameState.world.planetRadius;
    const omega = gameState.world.earthRotationRate || 0;
    const ang = (this.padBaseAngle ?? 0) + omega * gameState.currentTime;
    const u = new Vector2(Math.cos(ang), Math.sin(ang));
    const t = new Vector2(-Math.sin(ang), Math.cos(ang));
    const base = u.multiply(R + 1);

    if (this.spritesReady) {
      for (const sprite of this.buildingSprites) {
        if (Math.abs(sprite.offset) < 160) continue; // safety: skip near-pad
        const center = base.add(t.multiply(sprite.offset)).add(u.multiply(sprite.height / 2));
        renderer.drawSprite(sprite.image, center, sprite.width, sprite.height);
      }
      // Draw trees after buildings so they sit in front of the pad horizon line
      for (const sprite of this.treeSprites) {
        if (Math.abs(sprite.offset) < 160) continue;
        const center = base.add(t.multiply(sprite.offset)).add(u.multiply(sprite.height / 2));
        renderer.drawSprite(sprite.image, center, sprite.width, sprite.height);
      }
    } else {
      // Fallback vector drawing in test environments
      for (const def of this.buildingDefs) {
        if (Math.abs(def.offset) < 160) continue;
        const center = base.add(t.multiply(def.offset)).add(u.multiply(def.height / 2));
        const topLeft = new Vector2(center.x - def.width / 2, center.y - def.height / 2);
        renderer.drawRectangle(topLeft, def.width, def.height, def.color, '#556', 2);
        const b: Building = {
          position: new Vector2(topLeft.x + def.width / 2, topLeft.y),
          width: def.width,
          height: def.height,
          type: def.type,
          color: def.color,
        };
        this.addBuildingDetails(renderer, b);
      }
      // Simple fallback trees as triangles/caps
      for (const tre of this.treeDefs) {
        if (Math.abs(tre.offset) < 160) continue;
        const center = base.add(t.multiply(tre.offset)).add(u.multiply(tre.height / 2));
        if (tre.type === 'pine') {
          // Trunk
          renderer.drawRectangle(
            new Vector2(center.x - tre.width * 0.05, center.y + tre.height * 0.25),
            tre.width * 0.1,
            tre.height * 0.25,
            '#6d4c41'
          );
          // Canopy
          renderer.drawRotated(center, 0, () => {
            const p1 = new Vector2(0, tre.height * 0.5);
            const p2 = new Vector2(-tre.width * 0.45, -tre.height * 0.3);
            const p3 = new Vector2(tre.width * 0.45, -tre.height * 0.3);
            renderer.drawLine(center.add(p1), center.add(p2), '#2e7d32', 3);
            renderer.drawLine(center.add(p1), center.add(p3), '#2e7d32', 3);
            renderer.drawLine(center.add(p2), center.add(p3), '#2e7d32', 3);
          });
        } else {
          renderer.drawRectangle(
            new Vector2(center.x - tre.width * 0.05, center.y + tre.height * 0.2),
            tre.width * 0.1,
            tre.height * 0.3,
            '#6d4c41'
          );
          renderer.drawCircle(center, Math.max(3, tre.width * 0.4), '#388e3c');
        }
      }
    }
  }

  /**
   * Add details to buildings
   */
  private addBuildingDetails(renderer: CanvasRenderer, building: Building): void {
    const pos = building.position;

    switch (building.type) {
      case 'skyscraper': {
        // Vertical pale stripes
        const stripeW = building.width * 0.22;
        const leftX = pos.x - building.width / 2 + building.width * 0.18;
        const rightX = pos.x + building.width / 2 - building.width * 0.18 - stripeW;
        const pale = '#c9dcf8';
        renderer.drawRectangle(new Vector2(leftX, pos.y), stripeW, building.height, pale);
        renderer.drawRectangle(new Vector2(rightX, pos.y), stripeW, building.height, pale);
        // Antenna
        const top = new Vector2(pos.x, pos.y + building.height);
        renderer.drawLine(
          new Vector2(top.x, top.y),
          new Vector2(top.x, top.y + building.height * 0.12),
          '#9aa7b7',
          3
        );
        break;
      }
      case 'mid': {
        // Grid windows
        const cols = Math.max(4, Math.floor(building.width / 26));
        const rows = Math.max(3, Math.floor(building.height / 32));
        const winW = 8;
        const winH = 16;
        const gapX = (building.width - cols * winW) / (cols + 1);
        const gapY = (building.height - rows * winH) / (rows + 1);
        const baseX = pos.x - building.width / 2 + gapX;
        const baseY = pos.y + gapY;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const wx = baseX + c * (winW + gapX);
            const wy = baseY + r * (winH + gapY);
            renderer.drawRectangle(new Vector2(wx, wy), winW, winH, '#96b6ff');
          }
        }
        break;
      }
      case 'low': {
        // Few vents/windows (deterministic)
        const vents = Math.max(3, Math.floor(building.width / 50));
        const w = 16;
        const h = 10;
        const gap = 12;
        const total = vents * w + (vents - 1) * gap;
        let x = pos.x - total / 2;
        const y = pos.y + building.height / 2 - h / 2;
        for (let i = 0; i < vents; i++) {
          renderer.drawRectangle(new Vector2(x, y), w, h, '#9aa7b7');
          x += w + gap;
        }
        break;
      }
      case 'box': {
        // Framed short building (already drawn outline in render)
        const cols = Math.max(3, Math.floor(building.width / 50));
        const w = 10;
        const h = 14;
        const gap = (building.width - cols * w) / (cols + 1);
        const baseX = pos.x - building.width / 2 + gap;
        const baseY = pos.y + building.height / 2 - h / 2;
        for (let c = 0; c < cols; c++) {
          const wx = baseX + c * (w + gap);
          renderer.drawRectangle(new Vector2(wx, baseY), w, h, '#9fc3ff');
        }
        break;
      }
    }
  }
}

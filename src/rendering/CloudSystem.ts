export class CloudSystem {
  private cloudTextures: Map<string, HTMLCanvasElement> = new Map();
  private cloudLayers: CloudLayer[] = [];

  constructor() {
    this.generateCloudTextures();
    this.initializeLayers();
  }

  private generateCloudTextures(): void {
    // Generate cumulus cloud texture (low altitude, puffy)
    this.cloudTextures.set('cumulus', this.createCumulusTexture(256));
  }

  private createCumulusTexture(size: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    // Clear with transparency
    ctx.clearRect(0, 0, size, size);

    // Create puffy cumulus clouds using multiple overlapping circles
    const numClouds = 3 + Math.random() * 2;
    for (let i = 0; i < numClouds; i++) {
      const x = size * (0.2 + Math.random() * 0.6);
      const y = size * (0.3 + Math.random() * 0.4);
      const radius = size * (0.15 + Math.random() * 0.1);

      // Create gradient for each cloud puff
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.7)');
      grad.addColorStop(0.8, 'rgba(240, 245, 250, 0.4)');
      grad.addColorStop(1, 'rgba(240, 245, 250, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Add smaller puffs around main cloud
      for (let j = 0; j < 4; j++) {
        const angle = (j / 4) * Math.PI * 2;
        const puffX = x + Math.cos(angle) * radius * 0.6;
        const puffY = y + Math.sin(angle) * radius * 0.5;
        const puffRadius = radius * (0.4 + Math.random() * 0.2);

        const puffGrad = ctx.createRadialGradient(puffX, puffY, 0, puffX, puffY, puffRadius);
        puffGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        puffGrad.addColorStop(0.6, 'rgba(250, 252, 255, 0.5)');
        puffGrad.addColorStop(1, 'rgba(250, 252, 255, 0)');

        ctx.fillStyle = puffGrad;
        ctx.beginPath();
        ctx.arc(puffX, puffY, puffRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return canvas;
  }

  private createStratusTexture(size: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.clearRect(0, 0, size, size);

    // Create horizontal layered stratus clouds
    const numLayers = 2 + Math.random() * 2;
    for (let i = 0; i < numLayers; i++) {
      const y = size * (0.3 + i * 0.15 + Math.random() * 0.1);
      const height = size * (0.08 + Math.random() * 0.04);

      // Horizontal gradient for layer effect
      const grad = ctx.createLinearGradient(0, y - height / 2, 0, y + height / 2);
      grad.addColorStop(0, 'rgba(230, 235, 240, 0)');
      grad.addColorStop(0.2, 'rgba(230, 235, 240, 0.3)');
      grad.addColorStop(0.5, 'rgba(245, 248, 250, 0.5)');
      grad.addColorStop(0.8, 'rgba(230, 235, 240, 0.3)');
      grad.addColorStop(1, 'rgba(230, 235, 240, 0)');

      ctx.fillStyle = grad;

      // Create wavy layer using bezier curves
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= size; x += size / 8) {
        const wave = Math.sin((x / size) * Math.PI * 4) * height * 0.3;
        ctx.lineTo(x, y + wave);
      }
      ctx.lineTo(size, y + height);
      ctx.lineTo(0, y + height);
      ctx.closePath();
      ctx.fill();
    }

    return canvas;
  }

  private createCirrusTexture(size: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.clearRect(0, 0, size, size);

    // Create wispy cirrus clouds using thin strokes
    const numWisps = 4 + Math.random() * 3;
    for (let i = 0; i < numWisps; i++) {
      ctx.save();

      const startX = Math.random() * size;
      const startY = size * (0.2 + Math.random() * 0.6);
      const length = size * (0.3 + Math.random() * 0.4);
      const angle = -Math.PI / 6 + (Math.random() * Math.PI) / 3;

      ctx.translate(startX, startY);
      ctx.rotate(angle);

      // Create gradient along the wisp
      const grad = ctx.createLinearGradient(0, 0, length, 0);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.15)');
      grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.25)');
      grad.addColorStop(0.8, 'rgba(255, 255, 255, 0.15)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.strokeStyle = grad;
      ctx.lineWidth = 2 + Math.random() * 3;
      ctx.lineCap = 'round';

      // Draw wispy path
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const segments = 8;
      for (let j = 1; j <= segments; j++) {
        const x = (j / segments) * length;
        const y = Math.sin((j / segments) * Math.PI * 2) * (3 + Math.random() * 2);
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.restore();
    }

    return canvas;
  }

  private initializeLayers(): void {
    // Low altitude cumulus clouds (2-4 km) - just a few
    this.cloudLayers.push({
      altitude: 3000,
      rotationSpeed: 0.00001, // Slightly slower than planet
      clouds: this.generateCloudPositions('cumulus', 6, 0.8),
    });

    // Another layer slightly higher for depth
    this.cloudLayers.push({
      altitude: 5000,
      rotationSpeed: 0.000008,
      clouds: this.generateCloudPositions('cumulus', 4, 0.6),
    });
  }

  private generateCloudPositions(type: string, count: number, coverage: number): Cloud[] {
    const clouds: Cloud[] = [];

    // Launch pad is at top (π/2 radians), so avoid angles near that
    const launchAngle = Math.PI / 2;
    const exclusionZone = Math.PI / 3; // 60 degrees exclusion zone around launch area

    for (let i = 0; i < count; i++) {
      // Distribute clouds evenly but skip the launch area
      let baseAngle = (i / count) * Math.PI * 2;

      // Adjust angles to avoid the launch area at the top
      if (Math.abs(baseAngle - launchAngle) < exclusionZone) {
        // Shift cloud away from launch area
        if (baseAngle < launchAngle) {
          baseAngle = launchAngle - exclusionZone;
        } else {
          baseAngle = launchAngle + exclusionZone;
        }
      }

      const angleVariation = (Math.random() - 0.5) * ((Math.PI * 2) / count) * 0.5;
      let angle = baseAngle + angleVariation;

      // Double-check we're not in the exclusion zone after variation
      if (Math.abs(angle - launchAngle) < exclusionZone * 0.8) {
        // Push it further away
        angle = angle < launchAngle ? launchAngle - exclusionZone : launchAngle + exclusionZone;
      }

      clouds.push({
        type,
        angle,
        latitudeOffset: 0,
        scale: 1.2 + Math.random() * 0.6, // Bigger clouds
        opacity: 0.7 + Math.random() * 0.2, // More opaque
      });
    }

    return clouds;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    planetCenter: { x: number; y: number },
    planetRadius: number,
    currentTime: number,
    planetRotation: number
  ): void {
    ctx.save();

    // Render each cloud layer
    for (const layer of this.cloudLayers) {
      const layerRadius = planetRadius + (layer.altitude / 6371000) * planetRadius;
      const rotation = planetRotation + layer.rotationSpeed * currentTime;

      for (const cloud of layer.clouds) {
        const cloudAngle = cloud.angle + rotation;

        // Calculate cloud position around the planet
        const x = planetCenter.x + Math.cos(cloudAngle) * layerRadius;
        const y = planetCenter.y + Math.sin(cloudAngle) * layerRadius;

        // Get texture
        const texture = this.cloudTextures.get(cloud.type);
        if (!texture) continue;

        // Check if cloud is visible (not behind planet from viewer's perspective)
        // Simple check: if cloud is within planet radius from center, it might be visible
        const distFromCenter = Math.sqrt(x * x + y * y);
        const isNearEdge = Math.abs(distFromCenter - planetRadius) < planetRadius * 0.3;

        // Scale clouds - make them bigger
        const size = planetRadius * 0.25 * cloud.scale;

        // Set opacity
        ctx.globalAlpha = cloud.opacity * 0.8;

        // Draw cloud
        ctx.drawImage(texture, x - size / 2, y - size / 2, size, size);
      }
    }

    ctx.restore();
  }
}

interface CloudLayer {
  altitude: number; // meters above surface
  rotationSpeed: number; // radians per second
  clouds: Cloud[];
}

interface Cloud {
  type: string;
  angle: number; // position around planet
  latitudeOffset: number; // north/south offset
  scale: number;
  opacity: number;
}

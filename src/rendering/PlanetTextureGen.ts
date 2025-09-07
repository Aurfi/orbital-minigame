import { drawCartoonLand } from './PlanetShapes.js';

const cache = new Map<number, HTMLCanvasElement>();

export function getPlanetTexture(size: number): HTMLCanvasElement {
  const key = Math.max(32, Math.floor(size));
  const found = cache.get(key);
  if (found) return found;

  const c = document.createElement('canvas');
  c.width = key;
  c.height = key;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  // Enable anti-aliasing for smoother edges
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const R = key / 2;

  // Ocean base - fully opaque
  ctx.fillStyle = '#0b3766';
  ctx.beginPath();
  ctx.arc(R, R, R, 0, Math.PI * 2);
  ctx.fill();

  // Clip to disc and translate to center for world-space helpers
  ctx.save();
  ctx.beginPath();
  ctx.arc(R, R, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(R, R);

  // Land masses moved away from polar cap
  ctx.save();
  ctx.scale(1, 0.82);
  ctx.translate(0, R * 0.18);
  drawCartoonLand(ctx, R);
  ctx.restore();

  // Launchpad continent at the right (0 radians / east)
  // When the planet rotates by padBaseAngle (π/2) counterclockwise,
  // the right side (east) will rotate to the top
  ctx.fillStyle = '#2f7f3a';
  ctx.beginPath();
  // Start from the very right edge and create a large continent
  const rightX = R; // Full radius - at the very edge (east)
  const rightY = 0;
  ctx.moveTo(rightX, rightY - R * 0.25);
  ctx.lineTo(rightX, rightY + R * 0.25);
  // Create irregular coastline going left (inland)
  ctx.bezierCurveTo(
    rightX - R * 0.1,
    rightY + R * 0.3,
    rightX - R * 0.2,
    rightY + R * 0.35,
    rightX - R * 0.35,
    rightY + R * 0.3
  );
  ctx.bezierCurveTo(
    rightX - R * 0.45,
    rightY + R * 0.25,
    rightX - R * 0.5,
    rightY + R * 0.15,
    rightX - R * 0.48,
    rightY + R * 0.08
  );
  ctx.lineTo(rightX - R * 0.48, rightY - R * 0.08);
  ctx.bezierCurveTo(
    rightX - R * 0.5,
    rightY - R * 0.15,
    rightX - R * 0.45,
    rightY - R * 0.25,
    rightX - R * 0.35,
    rightY - R * 0.3
  );
  ctx.bezierCurveTo(
    rightX - R * 0.2,
    rightY - R * 0.35,
    rightX - R * 0.1,
    rightY - R * 0.3,
    rightX,
    rightY - R * 0.25
  );
  ctx.closePath();
  ctx.fill();

  // No additional bulges - keep the continent uniform

  // Polar cap at center with hard edge (no transparency)
  const capR = R * 0.34;

  // Ice cap base
  ctx.fillStyle = '#e8f4ff';
  ctx.beginPath();
  ctx.arc(0, 0, capR, 0, Math.PI * 2);
  ctx.fill();

  // Ice cap detail layers
  ctx.fillStyle = '#f0f8ff';
  ctx.beginPath();
  ctx.arc(0, 0, capR * 0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f8fcff';
  ctx.beginPath();
  ctx.arc(0, 0, capR * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Add some irregular ice edges
  ctx.fillStyle = '#e8f4ff';
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const wobble = 0.9 + Math.sin(i * 1.7) * 0.15;
    const blobR = capR * 0.15 * wobble;
    const blobX = Math.cos(angle) * capR * 0.85;
    const blobY = Math.sin(angle) * capR * 0.85;
    ctx.beginPath();
    ctx.arc(blobX, blobY, blobR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Atmosphere edge - very subtle, fully opaque gradient
  const edgeWidth = R * 0.03;
  const atmGrad = ctx.createRadialGradient(0, 0, R - edgeWidth, 0, 0, R);
  atmGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  atmGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
  atmGrad.addColorStop(1, 'rgba(135, 206, 235, 0.15)');
  ctx.fillStyle = atmGrad;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  cache.set(key, c);
  return c;
}

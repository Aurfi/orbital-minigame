export function drawCartoonLand(ctx: CanvasRenderingContext2D, R: number): void {
  const fill = (fn: () => void, color = '#2f7f3a') => {
    ctx.fillStyle = color;
    ctx.beginPath();
    fn();
    ctx.fill();
  };

  // Americas (rough blob)
  fill(() => {
    ctx.moveTo(-0.55 * R, 0.1 * R);
    ctx.bezierCurveTo(-0.7 * R, 0.35 * R, -0.42 * R, 0.5 * R, -0.3 * R, 0.32 * R);
    ctx.bezierCurveTo(-0.28 * R, 0.18 * R, -0.26 * R, 0.05 * R, -0.24 * R, -0.03 * R);
    ctx.bezierCurveTo(-0.27 * R, -0.2 * R, -0.38 * R, -0.28 * R, -0.52 * R, -0.36 * R);
    ctx.bezierCurveTo(-0.62 * R, -0.22 * R, -0.63 * R, -0.04 * R, -0.55 * R, 0.1 * R);
  });

  // Africa + Europe
  fill(() => {
    ctx.moveTo(0.2 * R, 0.2 * R);
    ctx.bezierCurveTo(0.36 * R, 0.26 * R, 0.42 * R, 0.1 * R, 0.34 * R, -0.02 * R);
    ctx.bezierCurveTo(0.28 * R, -0.1 * R, 0.22 * R, -0.1 * R, 0.16 * R, -0.12 * R);
    ctx.bezierCurveTo(0.1 * R, -0.06 * R, 0.06 * R, 0.06 * R, 0.08 * R, 0.16 * R);
    ctx.bezierCurveTo(0.12 * R, 0.24 * R, 0.16 * R, 0.24 * R, 0.2 * R, 0.2 * R);
  });

  // Asia extension
  fill(() => {
    ctx.moveTo(0.34 * R, -0.02 * R);
    ctx.bezierCurveTo(0.5 * R, 0.04 * R, 0.54 * R, 0.16 * R, 0.46 * R, 0.28 * R);
    ctx.bezierCurveTo(0.38 * R, 0.34 * R, 0.3 * R, 0.3 * R, 0.24 * R, 0.26 * R);
    ctx.bezierCurveTo(0.32 * R, 0.18 * R, 0.34 * R, 0.1 * R, 0.34 * R, -0.02 * R);
  });

  // Greenland / north islands
  fill(() => {
    ctx.moveTo(-0.12 * R, 0.5 * R);
    ctx.bezierCurveTo(-0.02 * R, 0.56 * R, 0.05 * R, 0.48 * R, 0.02 * R, 0.4 * R);
    ctx.bezierCurveTo(-0.04 * R, 0.38 * R, -0.08 * R, 0.4 * R, -0.12 * R, 0.5 * R);
  }, '#2e7f3a');

  // Small Caribbean/med islands
  const islands: Array<[number, number, number, number]> = [
    [-0.36, 0.16, 0.06, 0.04],
    [-0.3, 0.06, 0.04, 0.03],
    [0.18, 0.05, 0.05, 0.03],
  ];
  ctx.fillStyle = '#2f7f3a';
  for (const [ix, iy, sx, sy] of islands) {
    ctx.beginPath();
    ctx.ellipse(ix * R, iy * R, sx * R, sy * R, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

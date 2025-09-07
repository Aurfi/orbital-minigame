import { Vector2 } from '../physics/Vector2.js';

// Canvas 2D renderer for the game. Keeps world units and handles camera
// transforms so drawing code stays simple.
export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private camera: Camera | null = null;
  private pixelRatio: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D rendering context');
    }
    this.context = ctx;
    this.pixelRatio = window.devicePixelRatio || 1;
    this.setupCanvas();
  }

  /**
   * Initialize canvas with proper sizing and pixel ratio
   */
  private setupCanvas(): void {
    const rect = this.canvas.getBoundingClientRect();

    // Refresh DPR every time (browser zoom can change it)
    this.pixelRatio = window.devicePixelRatio || 1;

    // Set backing store size in device pixels
    const w = Math.max(1, Math.floor(rect.width * this.pixelRatio));
    const h = Math.max(1, Math.floor(rect.height * this.pixelRatio));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;

    // Reset then scale to avoid compounding on repeated setup
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.scale(this.pixelRatio, this.pixelRatio); // device-pixel aware

    // Set CSS size (logical pixels)
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
  }

  // Detect browser zoom (DPR) changes even when no resize fires
  private refreshDprIfNeeded(): void {
    const dpr = window.devicePixelRatio || 1;
    if (Math.abs(dpr - this.pixelRatio) > 1e-3) {
      this.pixelRatio = dpr;
      this.setupCanvas();
    }
  }

  /**
   * Set the camera for world-to-screen transformations
   * @param camera Camera instance
   */
  setCamera(camera: Camera): void {
    this.camera = camera;
  }

  /**
   * Clear the canvas
   */
  clear(): void {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Begin rendering frame
   */
  beginFrame(): void {
    // Keep canvas backing store in sync with DPR changes
    this.refreshDprIfNeeded();
    this.context.save();

    if (this.camera) {
      // Apply camera transformation
      const centerX = this.canvas.width / (2 * this.pixelRatio);
      const centerY = this.canvas.height / (2 * this.pixelRatio);

      this.context.translate(centerX, centerY);
      this.context.scale(this.camera.zoom, -this.camera.zoom); // Flip Y axis
      // Rotate world so that local "+Y" (up from planet) stays at screen top when requested
      const rot = this.camera.rotation || 0;
      if (rot !== 0) this.context.rotate(-rot);
      this.context.translate(-this.camera.position.x, -this.camera.position.y);
    }
  }

  /**
   * End rendering frame
   */
  endFrame(): void {
    this.context.restore();
  }

  /**
   * Draw a circle
   * @param center Center position
   * @param radius Radius
   * @param fillColor Fill color (optional)
   * @param strokeColor Stroke color (optional)
   * @param lineWidth Line width (optional)
   */
  drawCircle(
    center: Vector2,
    radius: number,
    fillColor?: string,
    strokeColor?: string,
    lineWidth = 1
  ): void {
    this.context.beginPath();
    this.context.arc(center.x, center.y, radius, 0, 2 * Math.PI);

    if (fillColor) {
      this.context.fillStyle = fillColor;
      this.context.fill();
    }

    if (strokeColor) {
      this.context.strokeStyle = strokeColor;
      this.context.lineWidth = lineWidth;
      this.context.stroke();
    }
  }

  /**
   * Draw a rectangle
   * @param position Top-left position
   * @param width Width
   * @param height Height
   * @param fillColor Fill color (optional)
   * @param strokeColor Stroke color (optional)
   * @param lineWidth Line width (optional)
   */
  drawRectangle(
    position: Vector2,
    width: number,
    height: number,
    fillColor?: string,
    strokeColor?: string,
    lineWidth = 1
  ): void {
    if (fillColor) {
      this.context.fillStyle = fillColor;
      this.context.fillRect(position.x, position.y, width, height);
    }

    if (strokeColor) {
      this.context.strokeStyle = strokeColor;
      this.context.lineWidth = lineWidth;
      this.context.strokeRect(position.x, position.y, width, height);
    }
  }

  /**
   * Draw a line
   * @param start Start position
   * @param end End position
   * @param color Line color
   * @param lineWidth Line width
   */
  drawLine(start: Vector2, end: Vector2, color: string, lineWidth = 1): void {
    this.context.beginPath();
    this.context.moveTo(start.x, start.y);
    this.context.lineTo(end.x, end.y);
    this.context.strokeStyle = color;
    this.context.lineWidth = lineWidth;
    this.context.stroke();
  }

  /**
   * Draw text
   * @param text Text to draw
   * @param position Position
   * @param color Text color
   * @param font Font specification
   * @param align Text alignment
   */
  drawText(
    text: string,
    position: Vector2,
    color = '#ffffff',
    font = '16px monospace',
    align: CanvasTextAlign = 'left'
  ): void {
    this.context.fillStyle = color;
    this.context.font = font;
    this.context.textAlign = align;
    this.context.fillText(text, position.x, position.y);
  }

  /**
   * Draw a rotated sprite/shape
   * @param position Center position
   * @param rotation Rotation in radians
   * @param drawFunction Function to draw the shape
   */
  drawRotated(position: Vector2, rotation: number, drawFunction: () => void): void {
    this.context.save();
    this.context.translate(position.x, position.y);
    this.context.rotate(rotation);
    drawFunction();
    this.context.restore();
  }

  /**
   * Draw a sprite (image) with rotation and scaling
   * @param image Image or canvas to draw
   * @param position Center position
   * @param width Width to draw (optional, uses image width if not specified)
   * @param height Height to draw (optional, uses image height if not specified)
   * @param rotation Rotation in radians (optional)
   * @param scaleX Horizontal scale factor (optional, default 1)
   * @param scaleY Vertical scale factor (optional, default 1)
   */
  drawSprite(
    image: HTMLImageElement | HTMLCanvasElement,
    position: Vector2,
    width?: number,
    height?: number,
    rotation = 0,
    scaleX = 1,
    scaleY = 1
  ): void {
    const drawWidth = width ?? image.width;
    const drawHeight = height ?? image.height;

    this.context.save();

    // Enable high-quality image smoothing for better appearance when zoomed
    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = 'high';

    // Move to position and apply transformations
    this.context.translate(position.x, position.y);
    if (rotation !== 0) {
      this.context.rotate(rotation);
    }
    if (scaleX !== 1 || scaleY !== 1) {
      this.context.scale(scaleX, scaleY);
    }
    // Compensate the world Y-up transform (camera flips Y). Without this,
    // bitmaps would render upside down compared to vector shapes.
    this.context.scale(1, -1);

    // Draw image centered at the transformed origin
    this.context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

    this.context.restore();
  }

  /**
   * Convert world coordinates to screen coordinates
   * @param worldPos World position
   * @returns Screen position
   */
  worldToScreen(worldPos: Vector2): Vector2 {
    if (!this.camera) return worldPos.clone();

    const centerX = this.canvas.width / (2 * this.pixelRatio);
    const centerY = this.canvas.height / (2 * this.pixelRatio);

    const relativePos = worldPos.subtract(this.camera.position);
    const screenX = centerX + relativePos.x * this.camera.zoom;
    const screenY = centerY - relativePos.y * this.camera.zoom; // Flip Y

    return new Vector2(screenX, screenY);
  }

  /**
   * Fill screen with a radial gradient defined in world coordinates.
   * Center and radii are mapped to screen space using the current camera.
   */
  fillRadialGradientWorld(
    centerWorld: Vector2,
    innerRadiusWorld: number,
    outerRadiusWorld: number,
    innerColor: string,
    outerColor: string
  ): void {
    const ctx = this.context;
    const centerScreen = this.worldToScreen(centerWorld);
    const zoom = this.camera ? this.camera.zoom : 1;
    const r0 = Math.max(0, innerRadiusWorld * zoom);
    const r1 = Math.max(r0 + 1, outerRadiusWorld * zoom);

    ctx.save();
    // Draw in screen space
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const grad = ctx.createRadialGradient(
      centerScreen.x,
      centerScreen.y,
      r0,
      centerScreen.x,
      centerScreen.y,
      r1
    );
    grad.addColorStop(0, innerColor);
    grad.addColorStop(1, outerColor);
    ctx.fillStyle = grad;
    // Fill the visible canvas (CSS pixels)
    const w = this.canvas.width / this.pixelRatio;
    const h = this.canvas.height / this.pixelRatio;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /**
   * Convert screen coordinates to world coordinates
   * @param screenPos Screen position
   * @returns World position
   */
  screenToWorld(screenPos: Vector2): Vector2 {
    if (!this.camera) return screenPos.clone();

    const centerX = this.canvas.width / (2 * this.pixelRatio);
    const centerY = this.canvas.height / (2 * this.pixelRatio);

    const relativeX = (screenPos.x - centerX) / this.camera.zoom;
    const relativeY = -(screenPos.y - centerY) / this.camera.zoom; // Flip Y

    return this.camera.position.add(new Vector2(relativeX, relativeY));
  }

  /**
   * Handle canvas resize
   */
  handleResize(): void {
    this.setupCanvas();
  }

  /**
   * Get canvas dimensions
   * @returns Canvas size
   */
  getSize(): Vector2 {
    return new Vector2(this.canvas.width / this.pixelRatio, this.canvas.height / this.pixelRatio);
  }

  /**
   * Access the underlying 2D context (screen space)
   */
  getContext2D(): CanvasRenderingContext2D {
    return this.context;
  }
}

// Camera class for view management
export class Camera {
  public position: Vector2;
  public zoom: number;
  public target: Vector2 | null = null;
  public rotation = 0; // radians; positive rotates world counter‑clockwise

  private followSpeed = 2.0;
  private zoomSpeed = 1.0;

  constructor(position: Vector2 = Vector2.zero(), zoom = 1.0) {
    this.position = position.clone();
    this.zoom = zoom;
  }

  /**
   * Update camera position and zoom
   * @param deltaTime Frame time
   */
  update(deltaTime: number): void {
    if (this.target) {
      // Smooth follow target
      const direction = this.target.subtract(this.position);
      const distance = direction.magnitude();

      if (distance > 1) {
        const moveAmount = this.followSpeed * deltaTime;
        const movement = direction.normalized().multiply(Math.min(moveAmount * distance, distance));
        this.position = this.position.add(movement);
      }
    }
  }

  /**
   * Set camera target to follow
   * @param target Target position
   */
  setTarget(target: Vector2 | null): void {
    this.target = target?.clone() || null;
  }

  /**
   * Set camera zoom with limits
   * @param zoom New zoom level
   */
  setZoom(zoom: number): void {
    this.zoom = Math.max(0.0007, Math.min(2.0, zoom));
  }

  /**
   * Move camera by offset
   * @param offset Movement offset
   */
  move(offset: Vector2): void {
    this.position = this.position.add(offset);
  }

  /**
   * Set camera position directly
   * @param position New position
   */
  setPosition(position: Vector2): void {
    this.position = position.clone();
  }

  /** Set camera rotation (radians) */
  setRotation(radians: number): void {
    this.rotation = radians;
  }
}

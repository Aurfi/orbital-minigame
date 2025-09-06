// Lightweight 2D vector. Small and readable, enough for this game.
export class Vector2 {
  constructor(
    public x = 0,
    public y = 0
  ) {}

  // Static factory methods
  static zero(): Vector2 {
    return new Vector2(0, 0);
  }

  static one(): Vector2 {
    return new Vector2(1, 1);
  }

  static up(): Vector2 {
    return new Vector2(0, 1);
  }

  static right(): Vector2 {
    return new Vector2(1, 0);
  }

  // Unit vector from angle (radians). Magnitude can be scaled.
  static fromAngle(angle: number, magnitude = 1): Vector2 {
    return new Vector2(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude);
  }

  // Basic immutable operations (return new vectors)
  add(other: Vector2): Vector2 {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  subtract(other: Vector2): Vector2 {
    return new Vector2(this.x - other.x, this.y - other.y);
  }

  multiply(scalar: number): Vector2 {
    return new Vector2(this.x * scalar, this.y * scalar);
  }

  divide(scalar: number): Vector2 {
    return new Vector2(this.x / scalar, this.y / scalar);
  }

  // Vector operations
  dot(other: Vector2): number {
    return this.x * other.x + this.y * other.y;
  }

  cross(other: Vector2): number {
    return this.x * other.y - this.y * other.x;
  }

  magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  magnitudeSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  // Safe normalize: returns (0,0) when magnitude is 0
  normalized(): Vector2 {
    const mag = this.magnitude();
    return mag > 0 ? this.divide(mag) : Vector2.zero();
  }

  angle(): number {
    return Math.atan2(this.y, this.x);
  }

  distanceTo(other: Vector2): number {
    return this.subtract(other).magnitude();
  }

  distanceSquaredTo(other: Vector2): number {
    return this.subtract(other).magnitudeSquared();
  }

  // Angle between two vectors (0..π)
  angleTo(other: Vector2): number {
    const dot = this.dot(other);
    const mag1 = this.magnitude();
    const mag2 = other.magnitude();

    if (mag1 === 0 || mag2 === 0) return 0;

    const cosAngle = dot / (mag1 * mag2);
    return Math.acos(Math.max(-1, Math.min(1, cosAngle)));
  }

  // Approximate equality with tolerance (useful for tests)
  equals(other: Vector2, tolerance = 1e-10): boolean {
    return Math.abs(this.x - other.x) < tolerance && Math.abs(this.y - other.y) < tolerance;
  }

  // Mutating operations (use carefully to avoid hidden aliasing)
  set(x: number, y: number): Vector2 {
    this.x = x;
    this.y = y;
    return this;
  }

  copy(other: Vector2): Vector2 {
    this.x = other.x;
    this.y = other.y;
    return this;
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  // Utility
  toString(): string {
    return `(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`;
  }
}

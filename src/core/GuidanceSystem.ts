import type { Vector2 } from '@/physics/Vector2.js';

export type GuidanceInputs = {
  // inputs
  turnLeft: boolean;
  turnRight: boolean;
  apHold: 'none' | 'prograde' | 'retrograde' | 'up' | 'target';
  apTargetRot: number | null;
  angularVelocity: number;
  angularAccel: number;
  maxTurnRate: number;
  debugEnabled: boolean;
  lastDebugLogTime: number;
  currentTime: number;
  // rocket state
  rotation: number;
  velocity: Vector2;
  position: Vector2;
  // world helpers
  getAltitude: (radius: number) => number;
};

export type GuidanceResult = {
  rotation: number;
  angularVelocity: number;
  apTargetRot: number | null;
  lastDebugLogTime: number;
  debugMessages?: string[];
};

export function updateGuidance(input: GuidanceInputs, deltaTime: number): GuidanceResult {
  let inputTurn = (input.turnLeft ? 1 : 0) - (input.turnRight ? 1 : 0);
  let apTargetRot = input.apTargetRot;
  const debug: string[] = [];

  if (input.apHold !== 'none') {
    if (input.apHold === 'up') {
      apTargetRot = 0;
    } else if (input.apHold === 'prograde' || input.apHold === 'retrograde') {
      const v = input.velocity;
      const speed = v.magnitude();
      let velAngle = input.rotation;
      if (speed > 0.5) velAngle = Math.atan2(-v.x, v.y);
      const alt = input.getAltitude(input.position.magnitude());
      const a0 = 2000;
      const a1 = 15000;
      const tRaw = (alt - a0) / Math.max(1, a1 - a0);
      const t = Math.max(0, Math.min(1, tRaw));
      const s = t * t * (3 - 2 * t);
      const upAngle = 0;
      const targetPro = input.apHold === 'prograde' ? velAngle : velAngle + Math.PI;
      let d = targetPro - upAngle;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      apTargetRot = upAngle + d * s;
    }
    if (apTargetRot !== null) {
      let d = (apTargetRot as number) - input.rotation;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      inputTurn = d > 0.02 ? 1 : d < -0.02 ? -1 : 0;
    }
  }

  // Integrate angular velocity and clamp
  let angularVelocity = input.angularVelocity + inputTurn * input.angularAccel * deltaTime;
  const maxRate = input.maxTurnRate;
  if (angularVelocity > maxRate) angularVelocity = maxRate;
  if (angularVelocity < -maxRate) angularVelocity = -maxRate;
  const rotation = input.rotation + angularVelocity * deltaTime;

  // Gentle damping when no input
  if (inputTurn === 0) {
    const damping = 0.98;
    angularVelocity *= damping;
    if (Math.abs(angularVelocity) < 1e-4) angularVelocity = 0;
  }

  // Debug logs (throttled)
  let lastDebugLogTime = input.lastDebugLogTime;
  if (input.debugEnabled) {
    const now = input.currentTime;
    if (now - lastDebugLogTime > 0.1) {
      const deg = ((rotation * 180) / Math.PI).toFixed(2);
      const avDeg = ((angularVelocity * 180) / Math.PI).toFixed(2);
      debug.push(`ATT dt=${deltaTime.toFixed(3)} in=${inputTurn} rot=${deg}° av=${avDeg}°/s`);
      lastDebugLogTime = now;
    }
  }

  return { rotation, angularVelocity, apTargetRot, lastDebugLogTime, debugMessages: debug };
}

export function updateVisualGuidance(
  visualRotation: number,
  targetRotation: number,
  deltaTime: number
): number {
  const a = visualRotation;
  const b = targetRotation;
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const k = 10;
  const t = 1 - Math.exp(-k * Math.max(0, deltaTime));
  return a + d * t;
}

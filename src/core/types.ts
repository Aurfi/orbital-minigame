// Core type definitions
import { Vector2 } from '../physics/Vector2.js';
import { WorldParameters } from '../physics/WorldParameters.js';

export { Vector2 };

export interface GameState {
  isRunning: boolean;
  isPaused: boolean;
  timeWarp: number;
  currentTime: number;
  rocket: RocketState;
  world: WorldParameters;
  manualZoomControl?: boolean; // User has manually controlled zoom
  autopilotEnabled?: boolean;  // Auto Pilot mode toggle
}

export interface RocketState {
  position: Vector2;
  velocity: Vector2;
  rotation: number;
  visualRotation?: number; // Smoothed rotation for rendering only
  engineWorldPos?: Vector2; // World coordinates of engine exit
  engineDownDir?: Vector2;  // Direction pointing out of the engine (away from rocket)
  mass: number;
  fuel: number;
  throttle: number;
  isEngineIgnited: boolean;
  hasEverLaunched: boolean; // Track if rocket has ever been ignited
  isClamped?: boolean; // Held by pad clamps
  isOnGround?: boolean; // Resting on ground support (not clamped)
  currentStage: number;
  stages: StageConfiguration[];
  exhaustY?: number; // Y position of exhaust from active stage
  exhaustLength?: number; // Current exhaust plume length (px in local units)
  exhaustWidth?: number;  // Current exhaust plume width
  dragCoefficient?: number;
  crossSectionalArea?: number;
}

export interface StageConfiguration {
  name: string;
  thrust: number; // Maximum thrust (N)
  specificImpulse: number; // Specific impulse (s) – fallback/default
  seaLevelIsp?: number;    // Optional: Isp at sea level (s)
  vacuumIsp?: number;      // Optional: Isp in vacuum (s)
  propellantMass: number; // Initial propellant mass (kg)
  dryMass: number; // Dry mass without fuel (kg)
  isActive: boolean; // Currently active stage
  fuelRemaining: number; // Current fuel remaining (kg)
}


export interface CommandAPI {
  ignite(): boolean;
  throttle(value: number): void;
  stage(): boolean;
  pitch(degrees: number, overSeconds: number): void;
  hold(direction: 'prograde' | 'retrograde' | 'up'): void;
  wait(seconds: number): Promise<void>;
  wait_until(expression: string): Promise<void>;
  circularize(altitude: number): Promise<void>;
  deploy_payload(): boolean;
}

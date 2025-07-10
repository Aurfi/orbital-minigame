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
}

export interface RocketState {
  position: Vector2;
  velocity: Vector2;
  rotation: number;
  mass: number;
  fuel: number;
  throttle: number;
  isEngineIgnited: boolean;
  hasEverLaunched: boolean; // Track if rocket has ever been ignited
  currentStage: number;
  stages: StageConfiguration[];
  exhaustY?: number; // Y position of exhaust from active stage
}

export interface StageConfiguration {
  name: string;
  thrust: number; // Maximum thrust (N)
  specificImpulse: number; // Specific impulse (s)
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

// Centralized audio file paths and levels
export const SoundPaths = {
  engineStart: '/sounds/rocket-launch-306441.mp3',
  engineLoop: '/sounds/fx-looking-straight-into-a-burning-rocket-engine-283448.mp3',
  explosion: '/sounds/nuclear-explosion-386181.mp3',
  success: '/sounds/success-340660.mp3',
  start: '/sounds/game-start-6104.mp3',
} as const;

export function getEngineBaseGainForStage(stageIndex: number): number {
  // Stage 1 full loudness, upper stages slightly quieter
  return stageIndex <= 0 ? 1.0 : 0.7;
}

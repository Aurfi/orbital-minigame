// Main entry point for Mini Orbital Launch Game
import { GameEngine } from './core/GameEngine.js';
import { setupAutopilotConsole } from './ui/AutopilotConsole.js';
import { buildIntroMenu } from './ui/IntroMenu.js';
import { setupReadmeOverlay } from './ui/ReadmeOverlay.js';
import { setupSpeedControlsReflector } from './ui/SpeedControls.js';

console.log('Mini Orbital Launch Game - Initializing...');

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
if (!canvas) throw new Error('Canvas element not found');

async function startGame(): Promise<GameEngine | null> {
  try {
    const engine = new GameEngine(canvas);
    await engine.initialize();
    engine.start();
    setupAutopilotConsole(engine);

    const bezel = canvas.parentElement as HTMLElement | null;
    if (bezel && 'ResizeObserver' in window) {
      const ro = new ResizeObserver(() => window.dispatchEvent(new Event('resize')));
      ro.observe(bezel);
    }
    return engine;
  } catch (e) {
    console.error('Failed to start game:', e);
    return null;
  }
}

buildIntroMenu(canvas, startGame);
setupReadmeOverlay();
setupSpeedControlsReflector();

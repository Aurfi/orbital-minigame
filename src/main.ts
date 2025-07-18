// Main entry point for Mini Orbital Launch Game
import { GameEngine } from './core/GameEngine.js';

console.log('Mini Orbital Launch Game - Initializing... (FIXED v3)');

// Get canvas element
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
if (!canvas) {
  throw new Error('Canvas element not found');
}

// Function to resize canvas to fit the monitor container
function resizeCanvas() {
  // Get the screen bezel container
  const screenBezel = canvas.parentElement;
  if (!screenBezel) return;
  
  // Calculate available space inside the bezel (accounting for padding)
  const rect = screenBezel.getBoundingClientRect();
  const padding = 30; // Account for bezel padding
  const availableWidth = rect.width - padding;
  const availableHeight = rect.height - padding;
  
  // Use most of the available space (don't force 16:9 if it makes it too small)
  let canvasWidth = availableWidth;
  let canvasHeight = availableHeight;
  
  // Set high-resolution canvas for crisp rendering
  canvas.width = Math.max(1600, canvasWidth * window.devicePixelRatio);
  canvas.height = Math.max(900, canvasHeight * window.devicePixelRatio);
  
  // Scale the canvas context to match device pixel ratio
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }
  
  // Set CSS display size to fill container
  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${canvasHeight}px`;
  canvas.style.display = 'block';
}

// Initial resize
resizeCanvas();

// Handle window resize
window.addEventListener('resize', resizeCanvas);

// Initialize and start game
async function startGame() {
  try {
    const gameEngine = new GameEngine(canvas);
    await gameEngine.initialize();
    gameEngine.start();

    console.log('Game started successfully!');
    console.log('Controls:');
    console.log('  SPACE - Ignite engines');
    console.log('  Z - Full throttle');
    console.log('  X - Zero throttle');
    console.log('  S - Stage separation');
    console.log('  P - Pause/Resume');
  } catch (error) {
    console.error('Failed to start game:', error);
  }
}

startGame();

// Main entry point for Mini Orbital Launch Game
import { GameEngine } from './core/GameEngine.js';
import { isSoundEnabled, setSoundEnabled } from './core/Settings.js';

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

// Initialize but do not start automatically; wait for menu selection
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

// Intro menu overlay
function buildIntroMenu() {
  const bezel = canvas.parentElement as HTMLElement;
  if (!bezel) return;
  const overlay = document.createElement('div');
  overlay.id = 'intro-overlay';
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.background = 'rgba(0,0,0,0.8)';
  overlay.style.color = '#e8e8e8';
  overlay.style.zIndex = '10';

  const panel = document.createElement('div');
  panel.style.minWidth = '320px';
  panel.style.padding = '20px 24px';
  panel.style.border = '1px solid #444';
  panel.style.borderRadius = '8px';
  panel.style.background = 'rgba(20,20,30,0.9)';
  panel.style.boxShadow = '0 6px 24px rgba(0,0,0,0.5)';

  const title = document.createElement('div');
  title.textContent = 'Mini Orbital Launch';
  title.style.fontSize = '20px';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '12px';
  title.style.textAlign = 'center';
  panel.appendChild(title);

  const btn = (label: string) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.display = 'block';
    b.style.width = '100%';
    b.style.margin = '8px 0';
    b.style.padding = '10px 12px';
    b.style.fontFamily = 'Courier New, monospace';
    b.style.fontSize = '14px';
    b.style.background = 'linear-gradient(145deg,#404040,#303030)';
    b.style.color = '#ddd';
    b.style.border = '1px solid #555';
    b.style.borderRadius = '6px';
    b.style.cursor = 'pointer';
    b.onmouseenter = () => (b.style.background = 'linear-gradient(145deg,#505050,#404040)');
    b.onmouseleave = () => (b.style.background = 'linear-gradient(145deg,#404040,#303030)');
    return b;
  };

  const newGame = btn('New Game');
  newGame.onclick = async () => {
    overlay.remove();
    await startGame();
    try { localStorage.setItem('hasSave', '1'); } catch {}
  };

  const cont = btn('Continue Game');
  const hasSave = (() => { try { return localStorage.getItem('hasSave') === '1'; } catch { return false; } })();
  cont.disabled = !hasSave;
  cont.style.opacity = hasSave ? '1' : '0.5';
  cont.onclick = async () => {
    overlay.remove();
    // For now, start a new session; full state restore can be added later
    await startGame();
  };

  const opts = document.createElement('div');
  opts.style.marginTop = '6px';
  const soundRow = document.createElement('label');
  soundRow.style.display = 'flex';
  soundRow.style.alignItems = 'center';
  soundRow.style.gap = '8px';
  soundRow.style.fontSize = '13px';
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.checked = isSoundEnabled();
  chk.onchange = () => setSoundEnabled(chk.checked);
  const span = document.createElement('span');
  span.textContent = 'Sound enabled';
  soundRow.appendChild(chk);
  soundRow.appendChild(span);
  const optsTitle = document.createElement('div');
  optsTitle.textContent = 'Options';
  optsTitle.style.marginTop = '12px';
  optsTitle.style.marginBottom = '4px';
  optsTitle.style.color = '#9ecbff';
  optsTitle.style.fontSize = '13px';
  opts.appendChild(optsTitle);
  opts.appendChild(soundRow);

  panel.appendChild(newGame);
  panel.appendChild(cont);
  panel.appendChild(opts);
  overlay.appendChild(panel);
  bezel.appendChild(overlay);
}

buildIntroMenu();

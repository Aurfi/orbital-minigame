// Main entry point for Mini Orbital Launch Game
import { GameEngine } from './core/GameEngine.js';
import { isSoundEnabled, setSoundEnabled } from './core/Settings.js';

console.log('Mini Orbital Launch Game - Initializing...');

// Get canvas element
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
if (!canvas) {
  throw new Error('Canvas element not found');
}

// Initialize but do not start automatically; wait for menu selection
async function startGame(): Promise<GameEngine | null> {
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
    // Attach autopilot console now that engine exists
    setupAutopilotConsole(gameEngine);

    // Watch the bezel size with ResizeObserver so the canvas backing store
    // keeps in sync even when browser zoom changes (some browsers do not
    // dispatch a resize event on zoom). We simply rebroadcast a resize.
    const bezel = canvas.parentElement as HTMLElement | null;
    if (bezel && 'ResizeObserver' in window) {
      const ro = new (window as any).ResizeObserver(() => {
        window.dispatchEvent(new Event('resize'));
      });
      ro.observe(bezel);
    }
    return gameEngine;
  } catch (error) {
    console.error('Failed to start game:', error);
    return null;
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

// Auto Pilot Console UI (outside canvas)
function setupAutopilotConsole(engine: GameEngine) {
  const panel = document.createElement('div');
  panel.id = 'ap-panel';
  panel.style.marginTop = '8px';
  panel.style.padding = '8px 10px';
  panel.style.background = 'rgba(15,15,22,0.9)';
  panel.style.border = '1px solid #445';
  panel.style.borderRadius = '6px';
  panel.style.color = '#ddd';
  panel.style.display = 'none'; // hidden until autopilot

  const title = document.createElement('div');
  title.textContent = 'Command Console - Run your own scripts or try the Auto Pilot!';
  title.style.fontSize = '13px';
  title.style.color = '#9ecbff';
  title.style.marginBottom = '6px';
  panel.appendChild(title);

  // Log area (simple)
  const log = document.createElement('div');
  log.id = 'ap-log';
  log.style.height = '100px';
  log.style.overflowY = 'auto';
  log.style.background = 'rgba(0,0,0,0.35)';
  log.style.border = '1px solid #334';
  log.style.padding = '6px';
  log.style.marginBottom = '6px';
  panel.appendChild(log);

  const addLog = (msg: string) => {
    const line = document.createElement('div');
    line.textContent = msg;
    line.style.whiteSpace = 'pre-wrap';
    if (/^ERR:/i.test(msg)) {
      line.style.color = '#ff6666';
    }
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  };
  engine.setAutopilotLogger(addLog);

  // Input row
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '6px';

  const input = document.createElement('textarea');
  input.id = 'ap-input';
  // Keep examples to 4 compact lines, use `////` to show that
  // multiple commands can be written on the same line as separators.
  input.placeholder = [
    'Type commands then Run. Examples:',
    'ignite //// hold prograde',
    'throttle 0.6 //// wait 10',
    'until apoapsis 120000 then throttle 0.3',
    'cut'
  ].join('\n');
  input.style.flex = '1';
  input.style.height = '80px';
  input.style.resize = 'none'; // disable manual drag-resize; layout still adapts
  input.style.fontFamily = 'Courier New, monospace';
  input.style.fontSize = '12px';
  input.style.color = '#eee';
  input.style.background = 'rgba(0,0,0,0.5)';
  input.style.border = '1px solid #334';
  input.style.padding = '6px';
  row.appendChild(input);

  const runBtn = document.createElement('button');
  runBtn.textContent = 'Run';
  runBtn.style.minWidth = '80px';
  runBtn.onclick = () => {
    const text = input.value;
    if (text.trim()) {
      addLog('> run');
      engine.runAutopilotScript(text);
    }
  };
  row.appendChild(runBtn);

  const stopBtn = document.createElement('button');
  stopBtn.textContent = 'Stop';
  stopBtn.onclick = () => {
    engine.stopAutopilot();
    addLog('> stopped');
  };
  row.appendChild(stopBtn);

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.onclick = () => { log.innerHTML = ''; };
  row.appendChild(clearBtn);

  panel.appendChild(row);

  // Prefill script when HUD button is clicked
  document.addEventListener('prefill-autopilot-script', () => {
    const script = [
      'ignite',
      'hold up',
      'throttle 1',
      // Gravity turn: keep pitching east in steps; no prograde handoff yet
      'wait until altitude 1000',
      'pitch east 5',
      'wait until altitude 6000',
      'pitch east 15',
      'wait until altitude 15000',
      'pitch east 35',
      'wait until altitude 40000',
      'pitch east 55',
      'wait until stage empty',
      'throttle 0',
      'cut',
      'stage',
      // Start guiding along prograde before the coast
      'hold prograde',
      'wait until apoapsis',
      'ignite',
      // Second stage full throttle as well
      'throttle 1',
      'until periapsis = 110000',
      'cut'
    ].join('\n');
    input.value = script;
    input.focus();
  });

  // Insert under the speed controls (always visible; no separate modes)
  const ctrlPanel = document.querySelector('.control-panel');
  ctrlPanel?.appendChild(panel);
  panel.style.display = 'block';
}

// Hook console after starting a game session
(async () => {
  // Start immediately into menu; console will attach after New/Continue
  // Wait for canvas to exist (already exists); attach after first start
  // Small helper to intercept the first start
  const orig = (window as any)._startGameInternal;
})();

// READ ME overlay (tooltip-like panel over the monitor)
function setupReadmeOverlay() {
  const monitor = document.querySelector('.monitor-container') as HTMLElement | null;
  if (!monitor) return;

  // Create the button near the green power dot (bottom-left)
  const btn = document.createElement('button');
  btn.textContent = 'READ ME';
  btn.style.position = 'absolute';
  btn.style.left = '60px';
  btn.style.bottom = '6px';
  btn.style.transform = 'translateY(100%)';
  btn.style.padding = '6px 10px';
  btn.style.fontFamily = 'Courier New, monospace';
  btn.style.fontSize = '12px';
  btn.style.borderRadius = '12px';
  btn.style.border = '1px solid #555';
  btn.style.background = 'linear-gradient(145deg, #404040, #303030)';
  btn.style.color = '#ddd';
  btn.style.cursor = 'pointer';
  btn.style.zIndex = '5';
  btn.onmouseenter = () => (btn.style.background = 'linear-gradient(145deg,#505050,#404040)');
  btn.onmouseleave = () => (btn.style.background = 'linear-gradient(145deg,#404040,#303030)');
  monitor.appendChild(btn);

  // Overlay elements
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.55)';
  overlay.style.display = 'none';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '30';

  const card = document.createElement('div');
  card.style.width = 'min(820px, 92%)';
  card.style.maxHeight = '80%';
  card.style.overflowY = 'auto';
  card.style.background = 'linear-gradient(180deg, #131722 0%, #0f1220 100%)';
  card.style.border = '1px solid #556';
  card.style.borderRadius = '14px';
  card.style.boxShadow = '0 10px 30px rgba(0,0,0,0.6)';
  card.style.color = '#e6e9f2';
  card.style.padding = '18px 20px 14px';
  card.style.position = 'relative';

  const closeX = document.createElement('button');
  closeX.textContent = '×';
  closeX.title = 'Close';
  closeX.style.position = 'absolute';
  closeX.style.top = '10px';
  closeX.style.right = '10px';
  closeX.style.width = '26px';
  closeX.style.height = '26px';
  closeX.style.borderRadius = '50%';
  closeX.style.border = 'none';
  closeX.style.background = '#ff3b30'; // iOS-like red
  closeX.style.color = '#fff';
  closeX.style.fontSize = '18px';
  closeX.style.cursor = 'pointer';
  closeX.onclick = () => { overlay.style.display = 'none'; };
  card.appendChild(closeX);

  const content = document.createElement('div');
  content.style.fontSize = '14px';
  content.style.lineHeight = '1.55';
  content.style.marginBottom = '10px';
  content.style.whiteSpace = 'pre-wrap';
  content.textContent = `Welcome to Mini Orbital Launch 🚀
This is a tiny 2D rocket sandbox. 
Command Console :
Type simple lines and press Run. Use “then”, new lines, or spaces between steps.
Examples:
ignite throttle 1 until apoapsis = 100000 throttle 0 wait until apoapsis hold prograde ignite throttle 1 until periapsis = 110000 cut
You can also use:
pitch east 10 (aim nose a bit east), wait 5,
wait until altitude 15000, wait until stage empty,
hold prograde or hold retrograde, throttle 0.6, cut.
Tips:
• Pitch gently east (5°–15°), then let gravity + thrust bend the path.
• Coast to apoapsis, then circularize to raise periapsis. Aim ≈ 110 km.
• Keep an eye on staging !`;
  card.appendChild(content);

  // Lexicon button under READ ME
  const lexBtn = document.createElement('button');
  lexBtn.textContent = 'LEXICON';
  lexBtn.style.position = 'absolute';
  lexBtn.style.left = '160px';
  lexBtn.style.bottom = '6px';
  lexBtn.style.transform = 'translateY(100%)';
  lexBtn.style.padding = '6px 10px';
  lexBtn.style.fontFamily = 'Courier New, monospace';
  lexBtn.style.fontSize = '12px';
  lexBtn.style.borderRadius = '12px';
  lexBtn.style.border = '1px solid #555';
  lexBtn.style.background = 'linear-gradient(145deg, #404040, #303030)';
  lexBtn.style.color = '#ddd';
  lexBtn.style.cursor = 'pointer';
  lexBtn.style.zIndex = '5';
  lexBtn.onmouseenter = () => (lexBtn.style.background = 'linear-gradient(145deg,#505050,#404040)');
  lexBtn.onmouseleave = () => (lexBtn.style.background = 'linear-gradient(145deg,#404040,#303030)');
  (document.querySelector('.monitor-container') as HTMLElement)?.appendChild(lexBtn);

  const lexOverlay = document.createElement('div');
  lexOverlay.style.position = 'absolute';
  lexOverlay.style.inset = '0';
  lexOverlay.style.background = 'rgba(0,0,0,0.5)';
  lexOverlay.style.display = 'none';
  lexOverlay.style.alignItems = 'center';
  lexOverlay.style.justifyContent = 'center';
  lexOverlay.style.zIndex = '31';

  const lexCard = document.createElement('div');
  lexCard.style.width = 'min(700px, 92%)';
  lexCard.style.maxHeight = '78%';
  lexCard.style.overflowY = 'auto';
  lexCard.style.background = 'linear-gradient(180deg, #131722 0%, #0f1220 100%)';
  lexCard.style.border = '1px solid #556';
  lexCard.style.borderRadius = '14px';
  lexCard.style.boxShadow = '0 10px 30px rgba(0,0,0,0.6)';
  lexCard.style.color = '#e6e9f2';
  lexCard.style.padding = '18px 20px 14px';
  lexCard.style.position = 'relative';

  const lexClose = document.createElement('button');
  lexClose.textContent = '×';
  lexClose.title = 'Close';
  lexClose.style.position = 'absolute';
  lexClose.style.top = '10px';
  lexClose.style.right = '10px';
  lexClose.style.width = '26px';
  lexClose.style.height = '26px';
  lexClose.style.borderRadius = '50%';
  lexClose.style.border = 'none';
  lexClose.style.background = '#ff3b30';
  lexClose.style.color = '#fff';
  lexClose.style.fontSize = '18px';
  lexClose.style.cursor = 'pointer';
  lexClose.onclick = () => { lexOverlay.style.display = 'none'; };
  lexCard.appendChild(lexClose);

  const lexTitle = document.createElement('div');
  lexTitle.textContent = 'Lexicon — Simple words';
  lexTitle.style.fontSize = '18px';
  lexTitle.style.fontWeight = 'bold';
  lexTitle.style.marginBottom = '8px';
  lexCard.appendChild(lexTitle);

  const lexText = document.createElement('div');
  lexText.style.whiteSpace = 'pre-wrap';
  lexText.style.lineHeight = '1.6';
  lexText.textContent = `TWR (Thrust‑to‑Weight Ratio):
How strong your engines push compared to your weight. TWR > 1 means you can lift off.

Apoapsis (Ap):
The highest point of your orbit. If you coast to Ap and burn prograde, the other side rises.

Periapsis (Pe):
The lowest point of your orbit. If you burn prograde at Pe, the opposite side rises.

Prograde / Retrograde:
Prograde = the direction you are moving. Retrograde = the opposite direction.
Holding prograde during ascent creates a gravity turn; holding retrograde slows you down.

Circularize:
Burn at Ap (or Pe) to raise the opposite side until both match — that makes a circle.

Delta‑V (Δv):
Your "fuel budget" in m/s — how much you can change your speed. Fighting gravity or air resistance costs you extra.

ISP (Specific Impulse):
How efficient an engine is. Higher ISP means more push per unit of fuel (better efficiency).

Throttle:
How hard the engine pushes right now (0% to 100%). Lower throttle saves fuel but burns longer.
`;
  lexCard.appendChild(lexText);

  const lexCloseBottom = document.createElement('button');
  lexCloseBottom.textContent = 'Close';
  lexCloseBottom.style.marginTop = '6px';
  lexCloseBottom.style.padding = '8px 12px';
  lexCloseBottom.style.border = '1px solid #556';
  lexCloseBottom.style.background = '#1a2236';
  lexCloseBottom.style.color = '#e6e9f2';
  lexCloseBottom.style.borderRadius = '8px';
  lexCloseBottom.style.cursor = 'pointer';
  lexCloseBottom.onclick = () => { lexOverlay.style.display = 'none'; };
  lexCard.appendChild(lexCloseBottom);

  lexOverlay.appendChild(lexCard);
  (document.querySelector('.monitor-container') as HTMLElement)?.appendChild(lexOverlay);
  lexBtn.onclick = () => { lexOverlay.style.display = 'flex'; };

  const closeBottom = document.createElement('button');
  closeBottom.textContent = 'Close';
  closeBottom.style.marginTop = '6px';
  closeBottom.style.padding = '8px 12px';
  closeBottom.style.border = '1px solid #556';
  closeBottom.style.background = '#1a2236';
  closeBottom.style.color = '#e6e9f2';
  closeBottom.style.borderRadius = '8px';
  closeBottom.style.cursor = 'pointer';
  closeBottom.onclick = () => { overlay.style.display = 'none'; };
  card.appendChild(closeBottom);

  overlay.appendChild(card);
  monitor.appendChild(overlay);

  btn.onclick = () => { overlay.style.display = 'flex'; };
}

// Build the readme tooltip overlay button under the monitor
setupReadmeOverlay();

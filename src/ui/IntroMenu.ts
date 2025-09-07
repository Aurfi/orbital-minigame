import type { GameEngine } from '@/core/GameEngine.js';
import { isSoundEnabled, setSoundEnabled } from '@/core/Settings.js';
import { showHowToPlay } from './HowToPlay.js';

export function buildIntroMenu(
  canvas: HTMLCanvasElement,
  startGame: () => Promise<GameEngine | null>
): void {
  const bezel = canvas.parentElement as HTMLElement | null;
  if (!bezel) return;
  const overlay = document.createElement('div');
  overlay.id = 'intro-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
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
    b.onmouseenter = () => {
      b.style.background = 'linear-gradient(145deg,#505050,#404040)';
    };
    b.onmouseleave = () => {
      b.style.background = 'linear-gradient(145deg,#404040,#303030)';
    };
    return b;
  };

  const newGame = btn('New Game');
  newGame.setAttribute('aria-label', 'Start a new game');
  newGame.onclick = async () => {
    overlay.remove();
    await startGame();
    try {
      localStorage.setItem('hasSave', '1');
    } catch {}
  };

  const howto = btn('How to Play');
  howto.setAttribute('aria-label', 'How to play');
  howto.onclick = () => {
    showHowToPlay(canvas, startGame);
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
  panel.appendChild(howto);
  panel.appendChild(opts);
  overlay.appendChild(panel);
  bezel.appendChild(overlay);

  // Accessibility: ESC closes the overlay if focused
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    // If any top overlays are open, ignore ESC for the intro menu
    const readme = document.getElementById('readme-overlay');
    const lex = document.getElementById('lexicon-overlay');
    const howto = document.getElementById('howto-overlay');
    const visible = (el: HTMLElement | null) => !!el && el.style.display === 'flex';
    if (visible(readme as HTMLElement) || visible(lex as HTMLElement) || howto) return;
    overlay.remove();
  };
  document.addEventListener('keydown', onKey);
}

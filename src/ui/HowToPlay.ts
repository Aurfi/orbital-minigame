import type { GameEngine } from '@/core/GameEngine.js';

export function showHowToPlay(
  canvas: HTMLCanvasElement,
  _startGame: () => Promise<GameEngine | null>
): void {
  const bezel = canvas.parentElement as HTMLElement | null;
  if (!bezel) return;

  const overlay = document.createElement('div');
  overlay.id = 'howto-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.background = 'rgba(0,0,0,0.82)';
  overlay.style.zIndex = '12';

  const panel = document.createElement('div');
  panel.style.width = 'min(880px, 92vw)';
  panel.style.maxHeight = '86vh';
  panel.style.overflow = 'auto';
  panel.style.padding = '18px 22px';
  panel.style.border = '1px solid #3b4a66';
  panel.style.borderRadius = '10px';
  panel.style.background = 'linear-gradient(145deg, #141a26, #0f1520)';
  panel.style.boxShadow = '0 12px 40px rgba(0,0,0,0.6)';
  panel.style.color = '#e6eef8';
  panel.style.fontFamily = 'Courier New, monospace';

  const header = document.createElement('div');
  header.style.display = 'grid';
  header.style.gridTemplateColumns = '1fr';
  header.style.alignItems = 'center';
  header.style.marginBottom = '10px';

  const title = document.createElement('div');
  title.textContent = 'How to Play';
  title.style.fontSize = '18px';
  title.style.fontWeight = 'bold';
  title.style.color = '#9ecbff';
  title.style.justifySelf = 'start';
  header.appendChild(title);

  // No close button in header; a Back button sits at the bottom

  const section = (label: string) => {
    const sec = document.createElement('div');
    const h = document.createElement('div');
    h.textContent = label;
    h.style.marginTop = '10px';
    h.style.marginBottom = '6px';
    h.style.fontSize = '14px';
    h.style.color = '#a9c7ff';
    sec.appendChild(h);
    return { root: sec, head: h };
  };

  const keycap = (text: string) => {
    const k = document.createElement('span');
    k.textContent = text;
    k.style.display = 'inline-block';
    k.style.minWidth = '18px';
    k.style.padding = '3px 7px';
    k.style.margin = '2px 6px 2px 0';
    k.style.textAlign = 'center';
    k.style.border = '1px solid #3e77a8';
    k.style.borderRadius = '5px';
    k.style.background = 'linear-gradient(145deg,#1d2a3a,#162233)';
    k.style.color = '#d7e9ff';
    k.style.fontSize = '12px';
    return k;
  };

  // Manual controls
  const controls = section('Manual Controls');
  const ctrlList = document.createElement('div');
  ctrlList.style.display = 'grid';
  ctrlList.style.gridTemplateColumns = 'repeat(auto-fit, minmax(220px, 1fr))';
  ctrlList.style.gap = '6px 14px';
  const row = (k: string, d: string) => {
    const r = document.createElement('div');
    r.appendChild(keycap(k));
    const t = document.createElement('span');
    t.textContent = ` ${d}`;
    r.appendChild(t);
    return r;
  };
  ctrlList.append(
    row('Space', 'Ignite engine'),
    row('B', 'Cut engine'),
    row('T', 'Full throttle'),
    row('G', 'Zero throttle'),
    row('↑ / ↓', 'Throttle ±10%'),
    row('← / →', 'Turn left/right'),
    row('S', 'Stage'),
    row('Scroll', 'Zoom camera'),
    row('P', 'Pause')
  );
  controls.root.appendChild(ctrlList);

  // Game speed
  const speeds = section('Game Speed');
  const speedRow = document.createElement('div');
  speedRow.style.display = 'flex';
  speedRow.style.alignItems = 'center';
  speedRow.style.gap = '10px';
  const lbl = document.createElement('span');
  lbl.textContent = 'Adjust with:';
  const b = (text: string) => {
    const e = document.createElement('span');
    e.textContent = text;
    e.style.padding = '3px 8px';
    e.style.border = '1px solid #555';
    e.style.borderRadius = '4px';
    e.style.background = 'linear-gradient(145deg,#2d2d2d,#202020)';
    e.style.color = '#ddd';
    e.style.fontSize = '11px';
    return e;
  };
  speedRow.append(lbl, b('1x'), b('3x'), b('10x'), b('50x'));
  const hint = document.createElement('div');
  hint.textContent = 'Higher speeds unlock with altitude; a message will guide you.';
  hint.style.opacity = '0.9';
  hint.style.fontSize = '12px';
  hint.style.marginTop = '4px';
  speeds.root.append(speedRow, hint);

  // Autopilot
  const ap = section('Auto Pilot');
  const apText = document.createElement('div');
  apText.textContent = 'Run small scripts to automate launch. Example:';
  apText.style.marginBottom = '6px';
  const code = document.createElement('pre');
  code.textContent = [
    'ignite',
    'hold up',
    'throttle 1',
    'wait until altitude 6000',
    'pitch east 15',
    'wait until stage empty',
    'cut',
  ].join('\n');
  code.style.background = '#0e1724';
  code.style.border = '1px solid #24314a';
  code.style.borderRadius = '6px';
  code.style.padding = '10px 12px';
  code.style.color = '#c8e1ff';
  code.style.fontSize = '12px';
  code.style.overflowX = 'auto';
  ap.root.append(apText, code);

  // Footer with a small red Back button centered at the bottom
  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.justifyContent = 'center';
  footer.style.marginTop = '12px';
  const backBtn = document.createElement('button');
  backBtn.textContent = 'Back';
  backBtn.style.background = '#7a1f1f';
  backBtn.style.border = '1px solid #c62828';
  backBtn.style.color = '#ffeaea';
  backBtn.style.padding = '6px 10px';
  backBtn.style.borderRadius = '6px';
  backBtn.style.cursor = 'pointer';
  backBtn.onclick = () => overlay.remove();
  footer.appendChild(backBtn);

  panel.append(header, controls.root, speeds.root, ap.root, footer);
  overlay.appendChild(panel);
  bezel.appendChild(overlay);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      const evt = e as KeyboardEvent & { stopImmediatePropagation?: () => void };
      evt.stopImmediatePropagation?.();
      overlay.remove();
    }
  };
  document.addEventListener('keydown', onKey, { capture: true });
}

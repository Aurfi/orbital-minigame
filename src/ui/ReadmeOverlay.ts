export function setupReadmeOverlay(): void {
  const monitor = document.querySelector('.monitor-container') as HTMLElement | null;
  if (!monitor) return;

  const btn = document.createElement('button');
  btn.textContent = 'READ ME';
  btn.setAttribute('aria-label', 'Open readme overlay');
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
  btn.onmouseenter = () => {
    btn.style.background = 'linear-gradient(145deg,#505050,#404040)';
  };
  btn.onmouseleave = () => {
    btn.style.background = 'linear-gradient(145deg,#404040,#303030)';
  };
  monitor.appendChild(btn);

  const overlay = document.createElement('div');
  overlay.id = 'readme-overlay';
  overlay.style.position = 'absolute';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
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
  closeX.setAttribute('aria-label', 'Close overlay');
  closeX.title = 'Close';
  closeX.style.position = 'absolute';
  closeX.style.top = '10px';
  closeX.style.right = '10px';
  closeX.style.width = '26px';
  closeX.style.height = '26px';
  closeX.style.borderRadius = '50%';
  closeX.style.border = 'none';
  closeX.style.background = '#ff3b30';
  closeX.style.color = '#fff';
  closeX.style.fontSize = '18px';
  closeX.style.cursor = 'pointer';
  closeX.onclick = () => {
    overlay.style.display = 'none';
  };
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

  const closeBottom = document.createElement('button');
  closeBottom.textContent = 'Close';
  closeBottom.style.marginTop = '6px';
  closeBottom.style.padding = '8px 12px';
  closeBottom.style.border = '1px solid #556';
  closeBottom.style.background = '#1a2236';
  closeBottom.style.color = '#e6e9f2';
  closeBottom.style.borderRadius = '8px';
  closeBottom.style.cursor = 'pointer';
  closeBottom.onclick = () => {
    overlay.style.display = 'none';
  };
  card.appendChild(closeBottom);

  overlay.appendChild(card);
  monitor.appendChild(overlay);

  btn.onclick = () => {
    overlay.style.display = 'flex';
  };

  // Lexicon button under READ ME
  const lexBtn = document.createElement('button');
  lexBtn.textContent = 'LEXICON';
  lexBtn.setAttribute('aria-label', 'Open lexicon overlay');
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
  lexBtn.onmouseenter = () => {
    lexBtn.style.background = 'linear-gradient(145deg,#505050,#404040)';
  };
  lexBtn.onmouseleave = () => {
    lexBtn.style.background = 'linear-gradient(145deg,#404040,#303030)';
  };
  monitor.appendChild(lexBtn);

  const lexOverlay = document.createElement('div');
  lexOverlay.id = 'lexicon-overlay';
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
  lexClose.setAttribute('aria-label', 'Close lexicon');
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
  lexClose.onclick = () => {
    lexOverlay.style.display = 'none';
  };
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
  lexText.textContent = `TWR (Thrust‑to‑Weight Ratio):\nHow strong your engines push compared to your weight. TWR > 1 means you can lift off.\n\nApoapsis (Ap):\nThe highest point of your orbit. If you coast to Ap and burn prograde, the other side rises.\n\nPeriapsis (Pe):\nThe lowest point of your orbit. If you burn prograde at Pe, the opposite side rises.\n\nPrograde / Retrograde:\nPrograde = the direction you are moving. Retrograde = the opposite direction.\nHolding prograde during ascent creates a gravity turn; holding retrograde slows you down.\n\nCircularize:\nBurn at Ap (or Pe) to raise the opposite side until both match — that makes a circle.\n\nDelta‑V (Δv):\nYour "fuel budget" in m/s — how much you can change your speed. Fighting gravity or air resistance costs you extra.\n\nISP (Specific Impulse):\nHow efficient an engine is. Higher ISP means more push per unit of fuel (better efficiency).\n\nThrottle:\nHow hard the engine pushes right now (0% to 100%). Lower throttle saves fuel but burns longer.`;
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
  lexCloseBottom.onclick = () => {
    lexOverlay.style.display = 'none';
  };
  lexCard.appendChild(lexCloseBottom);

  lexOverlay.appendChild(lexCard);
  monitor.appendChild(lexOverlay);
  lexBtn.onclick = () => {
    lexOverlay.style.display = 'flex';
  };

  // ESC closes only these overlays; stop propagation so Intro menu stays open
  const onEsc = (e: KeyboardEvent) => {
    const readmeOpen = overlay.style.display === 'flex';
    const lexOpen = lexOverlay.style.display === 'flex';
    if (e.key === 'Escape' && (readmeOpen || lexOpen)) {
      e.preventDefault();
      e.stopPropagation();
      // Narrow cast to extend Event with stopImmediatePropagation if present
      const evt = e as KeyboardEvent & { stopImmediatePropagation?: () => void };
      evt.stopImmediatePropagation?.();
      overlay.style.display = 'none';
      lexOverlay.style.display = 'none';
    }
  };
  document.addEventListener('keydown', onEsc, { capture: true });
}

export function setupSpeedControlsReflector(): void {
  document.addEventListener('game-speed-change', (ev: Event) => {
    const s = (ev as CustomEvent).detail?.speed as number | undefined;
    if (!s) return;
    const btns = document.querySelectorAll('.speed-btn');
    for (const el of Array.from(btns)) {
      const b = el as HTMLButtonElement;
      const val = Number.parseInt(b.dataset.speed || '1');
      if (val === s) b.classList.add('active');
      else b.classList.remove('active');
    }
  });
}

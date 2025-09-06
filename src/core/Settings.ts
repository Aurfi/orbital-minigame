// Simple settings backed by localStorage
const KEY_SOUND = 'settings.soundEnabled';

export function isSoundEnabled(): boolean {
  try {
    const v = localStorage.getItem(KEY_SOUND);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try { localStorage.setItem(KEY_SOUND, on ? '1' : '0'); } catch {}
}


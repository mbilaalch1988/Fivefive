/**
 * Local preference flags. Persisted to localStorage and broadcast to any
 * subscribers via a window event so multiple components stay in sync.
 *
 * Mute flags live in notify.ts to keep them near their consumers; this file
 * holds visual prefs (color-blind mode, etc.).
 */

const COLORBLIND_KEY = "sequence.colorblind";
const PREFS_EVENT = "sequence:prefs-changed";

function read(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
function write(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch { /* ignore */ }
  // Dispatch on the next microtask so React state updates settle first.
  queueMicrotask(() => {
    try { window.dispatchEvent(new Event(PREFS_EVENT)); } catch { /* ignore */ }
  });
}

export const isColorBlindMode = () => read(COLORBLIND_KEY);
export const setColorBlindMode = (on: boolean) => {
  write(COLORBLIND_KEY, on);
  applyColorBlindClass();
};

/** Apply the body-level class so CSS pattern overlays activate. Idempotent. */
export function applyColorBlindClass(): void {
  if (typeof document === "undefined") return;
  const on = isColorBlindMode();
  document.body.classList.toggle("cb", on);
}

export function onPrefsChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PREFS_EVENT, cb);
  return () => window.removeEventListener(PREFS_EVENT, cb);
}

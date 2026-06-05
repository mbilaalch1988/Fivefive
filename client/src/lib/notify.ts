/**
 * Lightweight your-turn notifications: short device vibration + a two-tone
 * chime synthesized via Web Audio. Both fail silently on platforms that
 * don't support them. User can mute via localStorage.
 */
const MUTE_KEY = "sequence.muteTurnNotify";

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, "1");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    /* ignore */
  }
}

export function vibrate(pattern: number | number[] = [120, 60, 120]): void {
  if (typeof navigator === "undefined") return;
  if (!("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  try {
    const Ctor =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Play a soft two-tone chime (C5 then E5). */
export function playTurnChime(): void {
  const ctx = getCtx();
  if (!ctx) return;
  // Autoplay policies require resuming a user-gesture-suspended context.
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
  const t0 = ctx.currentTime;
  const playTone = (freq: number, start: number, dur: number, peak: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + start);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + start);
    osc.stop(t0 + start + dur + 0.02);
  };
  playTone(523.25, 0,    0.25, 0.18); // C5
  playTone(659.25, 0.14, 0.30, 0.22); // E5
}

/** Convenience: both vibration + chime, unless muted. */
export function notifyMyTurn(): void {
  if (isMuted()) return;
  vibrate([120, 60, 120]);
  playTurnChime();
}

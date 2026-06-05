/**
 * Your-turn notifications. Vibration and chime are independent mutes,
 * persisted to localStorage.
 */
const CHIME_MUTE_KEY = "sequence.muteChime";
const VIBRATE_MUTE_KEY = "sequence.muteVibration";

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
function writeFlag(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch { /* ignore */ }
}

export const isChimeMuted     = () => readFlag(CHIME_MUTE_KEY);
export const isVibrationMuted = () => readFlag(VIBRATE_MUTE_KEY);
export const setChimeMuted     = (m: boolean) => writeFlag(CHIME_MUTE_KEY, m);
export const setVibrationMuted = (m: boolean) => writeFlag(VIBRATE_MUTE_KEY, m);

function vibrate(pattern: number | number[] = [120, 60, 120]): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try { navigator.vibrate(pattern); } catch { /* ignore */ }
}

let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  try {
    const Ctor =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  } catch { return null; }
}

function playTurnChime(): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  const t0 = ctx.currentTime;
  const tone = (freq: number, start: number, dur: number, peak: number) => {
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
  tone(523.25, 0,    0.25, 0.18); // C5
  tone(659.25, 0.14, 0.30, 0.22); // E5
}

export function notifyMyTurn(): void {
  if (!isVibrationMuted()) vibrate([120, 60, 120]);
  if (!isChimeMuted()) playTurnChime();
}

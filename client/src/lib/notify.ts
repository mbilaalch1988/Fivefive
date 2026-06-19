/**
 * Game audio + haptics. All sound effects are synthesized via WebAudio
 * (no audio assets shipped). Vibration uses the standard navigator API.
 *
 * Two independent mute flags persisted to localStorage:
 *  - chime mute: silences ALL game audio (turn chime, chip drops, etc.)
 *  - vibration mute: silences haptic feedback
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

/* ------------------------------------------------------------ */
/* Low-level synth primitives                                    */
/* ------------------------------------------------------------ */

interface ToneOpts {
  freq: number;
  start?: number;
  dur: number;
  peak?: number;
  /** "sine" (default), "triangle", "square", "sawtooth". */
  type?: OscillatorType;
  /** Optional pitch bend: ramps to this freq over `dur`. */
  toFreq?: number;
}

function tone(ctx: AudioContext, t0: number, opts: ToneOpts): void {
  const { freq, start = 0, dur, peak = 0.18, type = "sine", toFreq } = opts;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0 + start);
  if (toFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(toFreq, t0 + start + dur);
  }
  gain.gain.setValueAtTime(0.0001, t0 + start);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0 + start);
  osc.stop(t0 + start + dur + 0.02);
}

/** Short burst of band-passed noise — used for thuds and zaps. */
function noiseBurst(
  ctx: AudioContext,
  t0: number,
  opts: { start?: number; dur: number; centerFreq: number; q?: number; peak?: number },
): void {
  const { start = 0, dur, centerFreq, q = 4, peak = 0.25 } = opts;
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = centerFreq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0 + start);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t0 + start);
  src.stop(t0 + start + dur);
}

function withCtx(fn: (ctx: AudioContext, t0: number) => void): void {
  if (isChimeMuted()) return;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  fn(ctx, ctx.currentTime);
}

/* ------------------------------------------------------------ */
/* Effect catalog                                                */
/* ------------------------------------------------------------ */

function playTurnChime(ctx: AudioContext, t0: number): void {
  tone(ctx, t0, { freq: 523.25, dur: 0.25, peak: 0.18 });          // C5
  tone(ctx, t0, { freq: 659.25, start: 0.14, dur: 0.30, peak: 0.22 }); // E5
}

export function notifyMyTurn(): void {
  if (!isVibrationMuted()) vibrate([120, 60, 120]);
  withCtx(playTurnChime);
}

/** Soft thunk for a chip landing on the board. */
export function playChipDrop(): void {
  withCtx((ctx, t0) => {
    // Low-end thump + dampened click.
    tone(ctx, t0, { freq: 180, toFreq: 90, dur: 0.18, peak: 0.18, type: "sine" });
    noiseBurst(ctx, t0, { dur: 0.06, centerFreq: 1800, q: 1.5, peak: 0.06 });
  });
}

/** Triple ascending bell — fires when a sequence locks. */
export function playSequenceDing(): void {
  withCtx((ctx, t0) => {
    tone(ctx, t0, { freq: 783.99, start: 0,    dur: 0.30, peak: 0.20, type: "triangle" }); // G5
    tone(ctx, t0, { freq: 987.77, start: 0.10, dur: 0.30, peak: 0.20, type: "triangle" }); // B5
    tone(ctx, t0, { freq: 1318.5, start: 0.20, dur: 0.45, peak: 0.22, type: "triangle" }); // E6
  });
}

/** Two-eyed Jack — magical chime with sparkle (high tone + downward sweep). */
export function playTwoEyedJack(): void {
  withCtx((ctx, t0) => {
    tone(ctx, t0, { freq: 1567.98, dur: 0.40, peak: 0.16, type: "sine" }); // G6
    tone(ctx, t0, { freq: 2349.32, start: 0.06, dur: 0.35, peak: 0.10, type: "triangle" }); // D7
    tone(ctx, t0, { freq: 880, toFreq: 220, start: 0.08, dur: 0.30, peak: 0.08, type: "sine" });
  });
}

/** One-eyed Jack — electric zap, descending. */
export function playOneEyedJack(): void {
  withCtx((ctx, t0) => {
    tone(ctx, t0, { freq: 880, toFreq: 110, dur: 0.25, peak: 0.20, type: "sawtooth" });
    noiseBurst(ctx, t0, { dur: 0.12, centerFreq: 3200, q: 2, peak: 0.08 });
  });
}

/** Victory fanfare on game end — bright ascending arpeggio. */
export function playWinFlourish(): void {
  withCtx((ctx, t0) => {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C-E-G-C-E
    notes.forEach((f, i) => {
      tone(ctx, t0, { freq: f, start: i * 0.10, dur: 0.45, peak: 0.18, type: "triangle" });
    });
  });
}

/** Single countdown tick — for the 3-2-1 pre-game beeps. */
export function playCountdownTick(): void {
  withCtx((ctx, t0) => {
    tone(ctx, t0, { freq: 660, dur: 0.10, peak: 0.18, type: "square" });
  });
}

/** GO! sound at the end of a countdown — bright whoosh + bell. */
export function playCountdownGo(): void {
  withCtx((ctx, t0) => {
    tone(ctx, t0, { freq: 220, toFreq: 1320, dur: 0.30, peak: 0.20, type: "sawtooth" });
    tone(ctx, t0, { freq: 1318.5, start: 0.08, dur: 0.30, peak: 0.22, type: "triangle" });
  });
}

import { useCallback, useEffect, useState } from "react";
import { useLargeScreen } from "./largeScreen";

/**
 * Per-user board orientation preference. Three modes:
 *   auto      — follow device orientation; switches to landscape on phone-
 *               sized viewports that report landscape, stays portrait
 *               otherwise (covers most desktops).
 *   portrait  — force the classic vertical layout, ignore device.
 *   landscape — force the rotated layout (board -90° CCW, hand on right).
 *
 * Persisted to localStorage so the choice survives reloads and applies
 * across screens. A custom event broadcasts changes so other components
 * mounted concurrently (e.g. the GameMenu pill + GameScreen layout) stay
 * in sync without prop drilling through useGame.
 */
export type OrientationMode = "auto" | "portrait" | "landscape";
export type EffectiveOrientation = "portrait" | "landscape";

const STORAGE_KEY = "fivefive.orientation";
const EVENT_NAME = "fivefive:orientation-change";
const VALID: OrientationMode[] = ["auto", "portrait", "landscape"];

/** Matches phones held in landscape but NOT a desktop in a wide window. */
const DEVICE_LANDSCAPE_MQ = "(orientation: landscape) and (max-height: 600px)";

function readStored(): OrientationMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && (VALID as string[]).includes(v)) return v as OrientationMode;
  } catch {
    /* localStorage unavailable */
  }
  return "auto";
}

function writeStored(mode: OrientationMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<OrientationMode>(EVENT_NAME, { detail: mode }));
}

function deriveEffective(mode: OrientationMode): EffectiveOrientation {
  if (mode !== "auto") return mode;
  try {
    return window.matchMedia(DEVICE_LANDSCAPE_MQ).matches ? "landscape" : "portrait";
  } catch {
    return "portrait";
  }
}

export interface OrientationState {
  mode: OrientationMode;
  effective: EffectiveOrientation;
  setMode: (next: OrientationMode) => void;
  /** Cycle auto → landscape → portrait → auto. */
  cycle: () => void;
}

export function useOrientation(): OrientationState {
  const [mode, setModeState] = useState<OrientationMode>(readStored);
  const [effective, setEffective] = useState<EffectiveOrientation>(() => deriveEffective(mode));

  useEffect(() => {
    setEffective(deriveEffective(mode));

    const mq = window.matchMedia(DEVICE_LANDSCAPE_MQ);
    const onMq = () => {
      // Only auto mode tracks device orientation. Forced modes ignore it.
      if (mode === "auto") setEffective(mq.matches ? "landscape" : "portrait");
    };
    mq.addEventListener("change", onMq);

    const onBroadcast = (e: Event) => {
      const next = (e as CustomEvent<OrientationMode>).detail;
      if (next && (VALID as string[]).includes(next) && next !== mode) {
        setModeState(next);
      }
    };
    window.addEventListener(EVENT_NAME, onBroadcast);

    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener(EVENT_NAME, onBroadcast);
    };
  }, [mode]);

  const setMode = useCallback((next: OrientationMode) => {
    setModeState(next);
    writeStored(next);
  }, []);

  const cycle = useCallback(() => {
    const idx = VALID.indexOf(mode);
    setMode(VALID[(idx + 1) % VALID.length]!);
  }, [mode, setMode]);

  return { mode, effective, setMode, cycle };
}

/**
 * Side-effect hook: mirrors the current orientation onto body data
 * attributes so CSS can target the user's chosen mode, the effective
 * render orientation, and whether the body should be rotated as a whole.
 * Mount once at the app root.
 *
 *   body[data-orientation="auto"]                   ← user pref
 *   body[data-orientation-effective="landscape"]    ← what's rendered
 *   body[data-rotator-active="true"]                ← whole-body 90° rotation
 *
 * On SMALL screens (phones / small tablets), landscape mode is expressed
 * by rotating the entire body -90° via CSS transform — the portrait UI
 * layout stays unchanged inside the rotation, board cells stay upright,
 * hand stays at the bottom. data-orientation-effective is forced to
 * "portrait" so the landscape-only CSS (board rotation, right-side hand
 * dock) doesn't fire. data-rotator-active flips the body transform on.
 *
 * On LARGE screens (laptops, tablets ≥ 1024×768), landscape mode applies
 * the layout-changing rules directly (board rotated, hand on right) and
 * no wrapper rotation is needed.
 */
export function useOrientationBodyAttr(): void {
  const { mode, effective } = useOrientation();
  const isLargeScreen = useLargeScreen();
  useEffect(() => {
    document.body.dataset.orientation = mode;
    document.body.dataset.orientationEffective = isLargeScreen ? effective : "portrait";
    // We also toggle a class on <html> when the rotator is active so the
    // viewport-level overflow lock can target html. CSS :has() would work
    // too, but the class is simpler and supported everywhere.
    if (!isLargeScreen && mode === "landscape") {
      document.body.dataset.rotatorActive = "true";
      document.documentElement.classList.add("ff-rotator-active");
    } else {
      delete document.body.dataset.rotatorActive;
      document.documentElement.classList.remove("ff-rotator-active");
    }
  }, [mode, effective, isLargeScreen]);
}

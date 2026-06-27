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
 * attributes so CSS can target the user's chosen mode and the effective
 * render orientation. Mount once at the app root.
 *
 *   body[data-orientation="auto"]                   ← user pref
 *   body[data-orientation-effective="landscape"]    ← what's rendered
 *
 * On SMALL screens, data-orientation-effective is forced to "portrait"
 * so the landscape-only CSS (board rotation, right-side hand dock) only
 * fires on large screens where the layout makes sense.
 *
 * The whole-body landscape rotation (data-rotator-active) is handled
 * separately by useBoardRotator() — that hook is mounted only inside
 * GameScreen so landing/lobby/spectate stay un-rotated even when the
 * user has landscape mode selected.
 */
export function useOrientationBodyAttr(): void {
  const { mode, effective } = useOrientation();
  const isLargeScreen = useLargeScreen();
  useEffect(() => {
    document.body.dataset.orientation = mode;
    document.body.dataset.orientationEffective = isLargeScreen ? effective : "portrait";
  }, [mode, effective, isLargeScreen]);
}

/**
 * Mount this in GameScreen. Toggles data-rotator-active on body + a
 * ff-rotator-active class on html when the user is on a small screen
 * AND has landscape mode selected. The matching CSS rotates the entire
 * body -90° so the portrait UI fits a sideways phone.
 *
 * Scoped to GameScreen on purpose — landing/lobby/spectate screens have
 * portrait-only layouts and don't have the game menu (which is where the
 * orientation toggle lives), so rotating them would trap the user with
 * a rotated lobby and no way back.
 *
 * The cleanup callback removes both markers on unmount, so leaving the
 * game (back to lobby) instantly un-rotates whatever comes next.
 */
export function useBoardRotator(): void {
  const { mode } = useOrientation();
  const isLargeScreen = useLargeScreen();
  useEffect(() => {
    const active = !isLargeScreen && mode === "landscape";
    if (active) {
      document.body.dataset.rotatorActive = "true";
      document.documentElement.classList.add("ff-rotator-active");
    } else {
      delete document.body.dataset.rotatorActive;
      document.documentElement.classList.remove("ff-rotator-active");
    }
    return () => {
      delete document.body.dataset.rotatorActive;
      document.documentElement.classList.remove("ff-rotator-active");
    };
  }, [mode, isLargeScreen]);
}

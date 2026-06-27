import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pinch-to-zoom + drag-to-pan controller for the game board.
 *
 * Behavior:
 *   • At scale = 1: pointerdown records a start position. No pan kicks in
 *     because pan only activates above scale 1.001. A pointerup with no
 *     intermediate movement passes the click through to the underlying
 *     cell (mouse: native click; touch: manually dispatched since
 *     touch-action: none suppresses browser synthesis).
 *   • At scale > 1: pointerdown records start. If subsequent pointermove
 *     exceeds PAN_THRESHOLD_PX, the hook commits to pan mode and captures
 *     the pointer. If the pointer never moves enough, it stays a tap and
 *     a click fires on the cell.
 *   • Two-finger pointerdown enters pinch mode immediately (the second
 *     finger is a clear signal that the user is gesturing, not tapping).
 *   • Pinch → pan handoff: when one of two fingers lifts mid-pinch, the
 *     remaining finger continues panning (if still zoomed).
 *   • Ctrl/Cmd-wheel zooms around the cursor on desktop.
 *   • Double-tap / double-click resets to 1×.
 */
export const ZOOM_LIMITS = { min: 0.6, max: 3 } as const;
const DOUBLE_TAP_MS = 300;
const WHEEL_STEP = 0.1;
/** How far a single pointer must move before we commit to pan mode. Below
 *  this, the gesture is treated as a tap and the click event is allowed
 *  to fire on the underlying cell. */
const PAN_THRESHOLD_PX = 6;

export interface BoardZoomState {
  scale: number;
  /** Pre-scale translation in CSS pixels of the zoom container. */
  tx: number;
  ty: number;
  /** Reset to scale=1, pan=0,0. Idempotent. */
  reset: () => void;
}

interface Pointer {
  /** Live position, updated on every pointermove. */
  x: number;
  y: number;
  /** Initial position at pointerdown — used by the pan-threshold check. */
  x0: number;
  y0: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function distance(a: Pointer, b: Pointer): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function useBoardZoom<E extends HTMLElement>(
  containerRef: React.RefObject<E | null>,
): BoardZoomState {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  // Live refs so the gesture loop doesn't trigger React renders per move.
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const lastTapRef = useRef(0);

  const apply = useCallback((s: number, x: number, y: number) => {
    scaleRef.current = s; txRef.current = x; tyRef.current = y;
    setScale(s); setTx(x); setTy(y);
  }, []);

  const reset = useCallback(() => { apply(1, 0, 0); }, [apply]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    type Mode = "idle" | "pinch" | "pan";
    let mode: Mode = "idle";
    const pointers = new Map<number, Pointer>();
    let pinchDistance0 = 1;
    let pinchScale0 = 1;
    let panTx0 = 0, panTy0 = 0;

    function rect() { return el!.getBoundingClientRect(); }

    function activeAround(focalX: number, focalY: number, newScale: number) {
      // Keep the focal point (under the fingers / cursor) stationary while
      // scaling: solve for the translation that holds focal fixed.
      const r = rect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const oldScale = scaleRef.current;
      const lx = (focalX - cx - txRef.current) / oldScale;
      const ly = (focalY - cy - tyRef.current) / oldScale;
      const nx = focalX - cx - lx * newScale;
      const ny = focalY - cy - ly * newScale;
      apply(newScale, nx, ny);
    }

    function onPointerDown(e: PointerEvent) {
      pointers.set(e.pointerId, {
        x: e.clientX, y: e.clientY,
        x0: e.clientX, y0: e.clientY,
      });
      if (pointers.size === 2) {
        const pts = Array.from(pointers.values()) as [Pointer, Pointer];
        pinchDistance0 = Math.max(1, distance(pts[0], pts[1]));
        pinchScale0 = scaleRef.current;
        mode = "pinch";
        try { el!.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        e.preventDefault();
      } else if (pointers.size === 1) {
        // Record the start of a potential pan/tap. Don't commit to pan
        // yet — wait for the pointer to actually move past the threshold.
        // This lets click events through on tap.
        panTx0 = txRef.current;
        panTy0 = tyRef.current;
        // Double-tap to reset (only meaningful when actually zoomed).
        const now = performance.now();
        if (now - lastTapRef.current < DOUBLE_TAP_MS && scaleRef.current !== 1) {
          reset();
        }
        lastTapRef.current = now;
      }
    }

    function onPointerMove(e: PointerEvent) {
      const ptr = pointers.get(e.pointerId);
      if (!ptr) return;
      ptr.x = e.clientX;
      ptr.y = e.clientY;

      if (mode === "pinch" && pointers.size >= 2) {
        const pts = Array.from(pointers.values()) as [Pointer, Pointer];
        const d = distance(pts[0], pts[1]);
        const proposed = pinchScale0 * (d / pinchDistance0);
        const newScale = clamp(proposed, ZOOM_LIMITS.min, ZOOM_LIMITS.max);
        const focalX = (pts[0].x + pts[1].x) / 2;
        const focalY = (pts[0].y + pts[1].y) / 2;
        activeAround(focalX, focalY, newScale);
        e.preventDefault();
        return;
      }

      // Single-pointer movement, scale > 1: check whether we've moved far
      // enough to commit to a pan. Below the threshold the gesture might
      // still resolve as a tap (so click can fire). Above, we capture and
      // start panning.
      if (mode === "idle" && pointers.size === 1 && scaleRef.current > 1.001) {
        const dx = ptr.x - ptr.x0;
        const dy = ptr.y - ptr.y0;
        if (Math.hypot(dx, dy) > PAN_THRESHOLD_PX) {
          mode = "pan";
          try { el!.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        }
      }

      if (mode === "pan" && pointers.size === 1) {
        apply(scaleRef.current, panTx0 + (ptr.x - ptr.x0), panTy0 + (ptr.y - ptr.y0));
        e.preventDefault();
      }
    }

    function onPointerUp(e: PointerEvent) {
      // Capture state BEFORE we mutate the pointer map / mode — the click
      // dispatch check below cares whether we panned/pinched at all.
      const wasGesture = mode === "pan" || mode === "pinch";
      const upX = e.clientX;
      const upY = e.clientY;
      const ptype = e.pointerType;

      pointers.delete(e.pointerId);
      try { el!.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

      if (pointers.size === 1 && mode === "pinch") {
        // Pinch → pan handoff. Reset the remaining pointer's baseline so
        // the next pan starts from the current finger position (not the
        // original pre-pinch one).
        const remaining = Array.from(pointers.values())[0]!;
        panTx0 = txRef.current; panTy0 = tyRef.current;
        remaining.x0 = remaining.x;
        remaining.y0 = remaining.y;
        mode = scaleRef.current > 1.001 ? "pan" : "idle";
      } else if (pointers.size === 0) {
        mode = "idle";
      }

      // Manual click dispatch for touch taps. The board container uses
      // touch-action: none so the browser never synthesizes click from
      // touch on its own — we have to fire one if the gesture resolved
      // as a tap (no movement past threshold). Mouse always fires native
      // click events, so skip there.
      if (!wasGesture && ptype !== "mouse" && pointers.size === 0) {
        const target = document.elementFromPoint(upX, upY) as HTMLElement | null;
        if (target) {
          target.dispatchEvent(new MouseEvent("click", {
            bubbles: true, cancelable: true,
            clientX: upX, clientY: upY,
            view: window,
          }));
        }
      }
    }

    function onPointerCancel(e: PointerEvent) {
      // System cancel (e.g. OS gesture took over) — clean up state without
      // dispatching any synthetic click.
      pointers.delete(e.pointerId);
      try { el!.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      if (pointers.size === 0) mode = "idle";
    }

    function onWheel(e: WheelEvent) {
      // Trackpad pinch on macOS arrives as wheel + ctrlKey. Mouse wheel
      // without modifier scrolls the page — we don't intercept that.
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const step = -Math.sign(e.deltaY) * WHEEL_STEP;
      const newScale = clamp(scaleRef.current + step, ZOOM_LIMITS.min, ZOOM_LIMITS.max);
      activeAround(e.clientX, e.clientY, newScale);
    }

    function onDblClick(e: MouseEvent) {
      if (scaleRef.current !== 1) {
        e.preventDefault();
        reset();
      }
    }

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dblclick", onDblClick);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dblclick", onDblClick);
    };
  }, [apply, reset, containerRef]);

  return { scale, tx, ty, reset };
}

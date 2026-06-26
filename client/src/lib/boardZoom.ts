import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pinch-to-zoom + drag-to-pan controller for the game board.
 *
 * Works on top of any existing CSS transform on the wrapped element (so it
 * composes with .ff-board-rotor's landscape rotation correctly — pinch and
 * pan operate in screen coordinates, independent of the board's own rotation
 * frame).
 *
 * Inputs:
 *   touch     — 2-finger pinch to zoom, 1-finger drag to pan (only when
 *               scale > 1, so cell taps still work at 1x).
 *   trackpad  — wheel events (Ctrl/Cmd-wheel on desktop trackpads) zoom
 *               around the cursor.
 *   double-tap / double-click — resets to 1x.
 *
 * Limits are exposed as ZOOM_LIMITS so the on-screen indicator can render
 * the right "min/max" affordances if we add them later.
 */
export const ZOOM_LIMITS = { min: 0.6, max: 3 } as const;
const DOUBLE_TAP_MS = 300;
const WHEEL_STEP = 0.1;

export interface BoardZoomState {
  scale: number;
  /** Pre-scale translation in CSS pixels of the zoom container. */
  tx: number;
  ty: number;
  /** Reset to scale=1, pan=0,0. Idempotent. */
  reset: () => void;
}

interface Pointer { x: number; y: number; }

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
    let panX0 = 0, panY0 = 0;
    let panTx0 = 0, panTy0 = 0;

    function rect() { return el!.getBoundingClientRect(); }

    function activeAround(focalX: number, focalY: number, newScale: number) {
      // Keep the focal point (under the fingers / cursor) stationary while
      // scaling: solve for the translation that holds focal fixed.
      const r = rect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const oldScale = scaleRef.current;
      // Current container-space coords of the focal point, pre-scale.
      const lx = (focalX - cx - txRef.current) / oldScale;
      const ly = (focalY - cy - tyRef.current) / oldScale;
      const nx = focalX - cx - lx * newScale;
      const ny = focalY - cy - ly * newScale;
      apply(newScale, nx, ny);
    }

    function onPointerDown(e: PointerEvent) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const pts = Array.from(pointers.values()) as [Pointer, Pointer];
        pinchDistance0 = Math.max(1, distance(pts[0], pts[1]));
        pinchScale0 = scaleRef.current;
        mode = "pinch";
        // Capture only when we're actually gesturing — otherwise the
        // browser retargets the subsequent click onto the zoom container
        // and Square cells never receive their click event.
        try { el!.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        e.preventDefault();
      } else if (pointers.size === 1 && scaleRef.current > 1.001) {
        panX0 = e.clientX; panY0 = e.clientY;
        panTx0 = txRef.current; panTy0 = tyRef.current;
        mode = "pan";
        try { el!.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      } else {
        // Single-finger tap at default zoom — leave the event alone so the
        // click bubbles through to the cell's onClick handler.
        const now = performance.now();
        if (now - lastTapRef.current < DOUBLE_TAP_MS && scaleRef.current !== 1) {
          reset();
        }
        lastTapRef.current = now;
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (mode === "pinch" && pointers.size >= 2) {
        const pts = Array.from(pointers.values()) as [Pointer, Pointer];
        const d = distance(pts[0], pts[1]);
        const proposed = pinchScale0 * (d / pinchDistance0);
        const newScale = clamp(proposed, ZOOM_LIMITS.min, ZOOM_LIMITS.max);
        const focalX = (pts[0].x + pts[1].x) / 2;
        const focalY = (pts[0].y + pts[1].y) / 2;
        activeAround(focalX, focalY, newScale);
        e.preventDefault();
      } else if (mode === "pan") {
        apply(scaleRef.current, panTx0 + (e.clientX - panX0), panTy0 + (e.clientY - panY0));
        e.preventDefault();
      }
    }

    function onPointerUp(e: PointerEvent) {
      pointers.delete(e.pointerId);
      try { el!.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      if (pointers.size === 1 && mode === "pinch") {
        // Pinch → pan handoff: continue panning with the remaining finger.
        const remaining = Array.from(pointers.values())[0]!;
        panX0 = remaining.x; panY0 = remaining.y;
        panTx0 = txRef.current; panTy0 = tyRef.current;
        mode = scaleRef.current > 1.001 ? "pan" : "idle";
      } else if (pointers.size === 0) {
        mode = "idle";
      }
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
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dblclick", onDblClick);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dblclick", onDblClick);
    };
  }, [apply, reset, containerRef]);

  return { scale, tx, ty, reset };
}

import { useEffect, useState } from "react";

/**
 * Detects "large" screens — both axes ≥ a threshold so the right-deck
 * sidebar (menu items + stacked hand) has room without crowding the board.
 *
 * Why min-width:1024 AND min-height:768 — the deck is ~280px wide; on a
 * narrower screen that'd leave the board cramped, and on a shorter screen
 * the deck would scroll its own content. The combination matches:
 *   • laptops/desktops in landscape (always)
 *   • iPad-class tablets (~10") in either orientation
 *   • larger phones in landscape (≥ 1024 wide is rare, but qualifies)
 * It excludes phones and small (7") tablets where the burger + bottom-dock
 * pattern stays better suited.
 */
const LARGE_SCREEN_MQ = "(min-width: 1024px) and (min-height: 768px)";

export function useLargeScreen(): boolean {
  const [isLarge, setIsLarge] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.matchMedia(LARGE_SCREEN_MQ).matches; } catch { return false; }
  });
  useEffect(() => {
    const mq = window.matchMedia(LARGE_SCREEN_MQ);
    const onChange = (e: MediaQueryListEvent) => setIsLarge(e.matches);
    mq.addEventListener("change", onChange);
    setIsLarge(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isLarge;
}

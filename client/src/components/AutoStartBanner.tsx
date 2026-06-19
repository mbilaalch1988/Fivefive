import { useEffect, useState } from "react";
import { playCountdownTick } from "../lib/notify";

interface Props {
  /** Epoch ms when game will auto-start; null hides banner. */
  autoStartAt: number | null;
}

/**
 * Lobby banner shown when all players are ready. Counts down from the
 * server-provided timestamp; the host can still hit Start to begin
 * immediately, or anyone can un-ready to cancel.
 */
export function AutoStartBanner({ autoStartAt }: Props) {
  const [secs, setSecs] = useState<number>(() =>
    autoStartAt ? Math.max(0, Math.ceil((autoStartAt - Date.now()) / 1000)) : 0,
  );
  const [lastTick, setLastTick] = useState<number>(-1);

  useEffect(() => {
    if (!autoStartAt) return;
    function update() {
      const remaining = Math.max(0, Math.ceil((autoStartAt! - Date.now()) / 1000));
      setSecs(remaining);
    }
    update();
    const h = window.setInterval(update, 200);
    return () => window.clearInterval(h);
  }, [autoStartAt]);

  // Beep on each whole-second tick down (3, 2, 1).
  useEffect(() => {
    if (!autoStartAt) return;
    if (secs <= 0) return;
    if (secs === lastTick) return;
    if (secs <= 3) playCountdownTick();
    setLastTick(secs);
  }, [secs, lastTick, autoStartAt]);

  if (!autoStartAt) return null;

  return (
    <div
      className="w-full rounded-2xl px-4 py-3 flex items-center gap-3 text-sm border"
      style={{
        background: "rgba(168, 85, 247, 0.15)",
        borderColor: "rgba(168, 85, 247, 0.45)",
        color: "#e9d5ff",
      }}
      role="status"
      data-testid="auto-start-banner"
    >
      <span className="text-xl">⏱</span>
      <span className="flex-1">
        Everyone's ready —{" "}
        <span className="font-bold text-fuchsia-200 tabular-nums">
          auto-starting in {secs}…
        </span>
      </span>
    </div>
  );
}

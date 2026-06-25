import { useEffect, useState } from "react";
import type { Fivefive, Team } from "@fivefive/shared";
import { TEAM_TEXT } from "../lib/cards";

interface Props {
  /** Team that just won (null = hide). */
  team: Team | null;
  teamName: string;
  sequences: Fivefive[];
  /** Total duration available — should match GameScreen's celebrate window. */
  totalDurationMs: number;
  /** Called when the walk finishes. */
  onDone?: () => void;
}

/**
 * Big banner across the top of the screen during the post-win celebration.
 * Counts up "Fivefive 1 of N" while each chip in the winning team's
 * sequences pulses (driven by Board.tsx via celebrateDelayMs). Pure
 * presentational — Board does the chip glow timing.
 */
export function WinSequenceWalk({ team, teamName, sequences, totalDurationMs, onDone }: Props) {
  const winningSeqs = sequences.filter((s) => s.team === team);
  const count = winningSeqs.length;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!team || count === 0) return;
    const perSeqMs = Math.max(500, Math.floor(totalDurationMs / count));
    let i = 1;
    setShown(1);
    const handle = setInterval(() => {
      i += 1;
      if (i > count) {
        clearInterval(handle);
        onDone?.();
        return;
      }
      setShown(i);
    }, perSeqMs);
    return () => clearInterval(handle);
  }, [team, count, totalDurationMs, onDone]);

  if (!team || count === 0) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-40 pointer-events-none flex justify-center">
      <div
        className="overlay-enter mt-20 sm:mt-24 px-5 py-3 rounded-2xl shadow-xl flex flex-col items-center gap-1 backdrop-blur"
        style={{ background: "rgba(19, 19, 22, 0.85)", border: "1px solid var(--md-outline)" }}
      >
        <div
          className={`text-2xl sm:text-3xl font-bold tracking-tight ${TEAM_TEXT[team]}`}
          style={{ textShadow: "0 0 14px currentColor" }}
        >
          {teamName} wins!
        </div>
        <div className="text-xs uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
          <span>★</span>
          <span>Fivefive {shown} of {count}</span>
        </div>
      </div>
    </div>
  );
}

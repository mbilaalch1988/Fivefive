import type { Team } from "@fivefive/shared";
import { TEAM_TEXT } from "../lib/cards";

interface Props {
  team: Team;
  teamName: string;
}

/**
 * Briefly overlays a "SEQUENCE!" wordmark across the viewport when a team
 * closes a sequence. Pure CSS keyframe (defined in index.css) — runs once
 * per mount, then the parent unmounts after a timer.
 */
export function SequenceAnnounce({ team, teamName }: Props) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
      <div className="sequence-announce-text text-center select-none">
        <div
          className="text-[3.2rem] sm:text-8xl font-black tracking-[0.15em] sm:tracking-[0.2em] text-amber-300 leading-none"
          style={{
            WebkitTextStroke: "2px rgba(0,0,0,0.5)",
            textShadow:
              "0 4px 30px rgba(252, 211, 77, 0.7), 0 0 60px rgba(252, 211, 77, 0.4)",
          }}
        >
          SEQUENCE!
        </div>
        <div
          className={`mt-2 text-sm sm:text-xl font-bold tracking-[0.3em] uppercase ${TEAM_TEXT[team]}`}
          style={{ textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}
        >
          {teamName}
        </div>
      </div>
    </div>
  );
}

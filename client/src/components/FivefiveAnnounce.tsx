import type { Team } from "@fivefive/shared";
import { TEAM_TEXT } from "../lib/cards";

interface Props {
  team: Team;
  teamName: string;
}

/**
 * Briefly overlays a "FIVEFIVE!" wordmark across the viewport when a team
 * closes a fivefive. Pure CSS keyframe (defined in index.css) — runs once
 * per mount, then the parent unmounts after a timer.
 */
export function FivefiveAnnounce({ team, teamName }: Props) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
      <div className="fivefive-announce-text text-center select-none">
        <div
          className="ff-wordmark text-[3.2rem] sm:text-8xl"
          style={{
            letterSpacing: "-0.04em",
            textShadow:
              "4px 4px 0 var(--ff-navy-ink), 0 6px 40px rgba(228, 195, 115, 0.55)",
          }}
        >
          FIVEFIVE!
        </div>
        <div
          className={`mt-3 text-sm sm:text-xl font-bold tracking-[0.3em] uppercase ${TEAM_TEXT[team]}`}
          style={{ textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}
        >
          {teamName}
        </div>
      </div>
    </div>
  );
}

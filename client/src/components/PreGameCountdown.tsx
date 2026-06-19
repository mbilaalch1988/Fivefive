import { useEffect, useState } from "react";
import type { Team } from "@sequence/shared";
import { TEAM_TEXT, TEAM_CHIP } from "../lib/cards";
import { playCountdownGo, playCountdownTick } from "../lib/notify";

type Stage = 3 | 2 | 1 | "go" | "name" | "done";

interface Props {
  firstPlayerName: string;
  firstPlayerTeam: Team;
  onDone: () => void;
}

const STAGE_MS = 900;
const GO_MS = 700;
const NAME_MS = 1300;

/**
 * 3 → 2 → 1 → GO! → "<First player> starts!" overlay. Plays before the
 * board becomes interactive at the start of a fresh game. The board is
 * still rendering its card-flip-in beneath; this just gates user input
 * and adds a hype moment.
 */
export function PreGameCountdown({ firstPlayerName, firstPlayerTeam, onDone }: Props) {
  const [stage, setStage] = useState<Stage>(3);

  useEffect(() => {
    let t: number | undefined;
    if (stage === 3) {
      playCountdownTick();
      t = window.setTimeout(() => setStage(2), STAGE_MS);
    } else if (stage === 2) {
      playCountdownTick();
      t = window.setTimeout(() => setStage(1), STAGE_MS);
    } else if (stage === 1) {
      playCountdownTick();
      t = window.setTimeout(() => setStage("go"), STAGE_MS);
    } else if (stage === "go") {
      playCountdownGo();
      t = window.setTimeout(() => setStage("name"), GO_MS);
    } else if (stage === "name") {
      t = window.setTimeout(() => setStage("done"), NAME_MS);
    } else {
      onDone();
    }
    return () => { if (t !== undefined) window.clearTimeout(t); };
  }, [stage, onDone]);

  if (stage === "done") return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
      }}
      data-testid="pre-game-countdown"
    >
      {(stage === 3 || stage === 2 || stage === 1) && (
        <div
          key={stage}
          className="text-[10rem] font-black tracking-tight text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)] countdown-pop"
          style={{ lineHeight: 1 }}
        >
          {stage}
        </div>
      )}
      {stage === "go" && (
        <div
          className="text-7xl sm:text-9xl font-black tracking-tight gradient-text countdown-burst"
          style={{ lineHeight: 1 }}
        >
          GO!
        </div>
      )}
      {stage === "name" && (
        <div className="flex flex-col items-center gap-4 text-center px-6 countdown-name">
          <div
            className={`inline-flex items-center gap-3 rounded-full px-5 py-2 text-3xl sm:text-4xl font-bold ${TEAM_CHIP[firstPlayerTeam]}`}
            style={{ border: "3px solid #18181b", boxShadow: "0 0 24px rgba(252, 211, 77, 0.5)" }}
          >
            <span className="text-white">{firstPlayerName}</span>
          </div>
          <div className={`text-xl sm:text-2xl font-bold ${TEAM_TEXT[firstPlayerTeam]}`}>
            starts!
          </div>
        </div>
      )}
    </div>
  );
}

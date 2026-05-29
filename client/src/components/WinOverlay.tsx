import type { Team } from "@sequence/shared";
import { TEAM_CHIP, TEAM_LABEL } from "../lib/cards";

interface Props {
  team: Team;
  onPlayAgain?: () => void;
}

export function WinOverlay({ team, onPlayAgain }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-100 text-slate-900 rounded-lg p-8 max-w-sm w-full text-center space-y-4 shadow-2xl">
        <div
          className={`mx-auto w-16 h-16 rounded-full border-4 ${TEAM_CHIP[team]}`}
        />
        <h2 className="text-2xl font-bold">{TEAM_LABEL[team]} team wins!</h2>
        {onPlayAgain && (
          <button
            type="button"
            onClick={onPlayAgain}
            className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700"
          >
            Play again
          </button>
        )}
      </div>
    </div>
  );
}

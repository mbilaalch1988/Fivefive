import type { GameView, PlayerId } from "@sequence/shared";
import { TEAM_CHIP, TEAM_LABEL } from "../lib/cards";

interface Props {
  view: GameView;
  myPlayerId: PlayerId | null;
}

export function TurnBar({ view, myPlayerId }: Props) {
  const current = view.players[view.turnIdx];
  const isMyTurn = current?.id === myPlayerId;
  const teams = Object.keys(view.teamSequenceCounts) as Array<keyof typeof view.teamSequenceCounts>;

  return (
    <div className="w-full flex flex-col gap-2">
      {current && (
        <div
          className={`w-full rounded-md px-3 py-2 sm:px-4 sm:py-3 flex items-center gap-2 sm:gap-3 ${
            isMyTurn
              ? "bg-amber-500/20 border-2 border-amber-400"
              : "bg-slate-800/60 border-2 border-transparent"
          }`}
        >
          <span
            className={`inline-block w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 ${TEAM_CHIP[current.team]} shadow`}
          />
          <span className="text-base sm:text-lg font-bold tracking-wide">
            {current.name}'s turn
          </span>
          {isMyTurn && (
            <span className="ml-auto text-amber-300 text-xs sm:text-sm font-semibold uppercase tracking-widest">
              your move
            </span>
          )}
        </div>
      )}

      <div className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 p-2 sm:p-3 bg-slate-800/40 rounded-md text-xs sm:text-sm">
        <span className="text-slate-400">Need {view.sequencesToWin}:</span>
        {teams.map((t) => {
          const count = view.teamSequenceCounts[t];
          if (count === 0 && !view.players.some((p) => p.team === t)) return null;
          return (
            <span key={t} className="flex items-center gap-1">
              <span className={`inline-block w-3 h-3 rounded-full border ${TEAM_CHIP[t]}`} />
              {TEAM_LABEL[t]}: <span className="font-semibold">{count}</span>
            </span>
          );
        })}
        <span className="ml-auto text-slate-400">Draw: {view.drawPileCount}</span>
      </div>
    </div>
  );
}

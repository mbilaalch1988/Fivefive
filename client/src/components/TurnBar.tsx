import type { GameView, PlayerId } from "@sequence/shared";
import { TEAM_CHIP, TEAM_LABEL } from "../lib/cards";

interface Props {
  view: GameView;
  myPlayerId: PlayerId | null;
}

export function TurnBar({ view, myPlayerId }: Props) {
  const current = view.players[view.turnIdx];
  const teams = Object.keys(view.teamSequenceCounts) as Array<keyof typeof view.teamSequenceCounts>;

  return (
    <div className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 p-2 sm:p-3 bg-slate-800/60 rounded-md text-xs sm:text-sm">
      <div className="flex items-center gap-2">
        <span className="text-slate-400">Turn:</span>
        {current && (
          <span className="font-semibold flex items-center gap-1.5">
            <span
              className={`inline-block w-3 h-3 rounded-full border ${TEAM_CHIP[current.team]}`}
            />
            {current.name}
            {current.id === myPlayerId && (
              <span className="ml-1 text-amber-300">(you)</span>
            )}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:ml-auto">
        <span className="text-slate-400">Need {view.sequencesToWin}:</span>
        {teams.map((t) => {
          const count = view.teamSequenceCounts[t];
          if (count === 0 && !view.players.some((p) => p.team === t)) return null;
          return (
            <span key={t} className="flex items-center gap-1">
              <span className={`inline-block w-3 h-3 rounded-full border ${TEAM_CHIP[t]}`} />
              {TEAM_LABEL[t]}: {count}
            </span>
          );
        })}
      </div>
      <div className="text-slate-400">Draw: {view.drawPileCount}</div>
    </div>
  );
}

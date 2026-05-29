import type { GameView, PlayerId, Team } from "@sequence/shared";
import { TEAM_CHIP } from "../lib/cards";

interface Props {
  view: GameView;
  myPlayerId: PlayerId | null;
}

export function TurnBar({ view, myPlayerId }: Props) {
  const current = view.players[view.turnIdx];
  const isMyTurn = current?.id === myPlayerId;
  const teams = Object.keys(view.teamSequenceCounts) as Team[];

  return (
    <div className="w-full flex flex-col gap-2">
      {current && (
        <div
          className={`w-full rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 flex items-center gap-3 transition-colors ${
            isMyTurn ? "bg-amber-400/20 ring-2 ring-amber-300" : ""
          }`}
          style={!isMyTurn ? { background: "var(--md-surface-1)" } : undefined}
        >
          <span
            className={`inline-block w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 ${TEAM_CHIP[current.team]} shadow`}
          />
          <span className="text-base sm:text-lg font-medium tracking-tight">
            {current.name}'s turn
          </span>
          {isMyTurn && (
            <span className="ml-auto text-amber-200 text-[0.65rem] sm:text-xs font-semibold uppercase tracking-widest">
              your move
            </span>
          )}
        </div>
      )}

      <div
        className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 p-2.5 sm:p-3 rounded-2xl text-xs sm:text-sm"
        style={{ background: "var(--md-surface-1)" }}
      >
        <span style={{ color: "var(--md-on-surface-variant)" }}>Need {view.sequencesToWin}:</span>
        {teams.map((t) => {
          const count = view.teamSequenceCounts[t];
          if (count === 0 && !view.players.some((p) => p.team === t)) return null;
          return (
            <span key={t} className="flex items-center gap-1.5">
              <span className={`inline-block w-3 h-3 rounded-full border ${TEAM_CHIP[t]}`} />
              {view.teamNames[t]}: <span className="font-semibold">{count}</span>
            </span>
          );
        })}
        <span className="ml-auto" style={{ color: "var(--md-on-surface-variant)" }}>
          Draw: {view.drawPileCount}
        </span>
      </div>
    </div>
  );
}

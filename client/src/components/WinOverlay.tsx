import { useState } from "react";
import type { RoomView, Team } from "@sequence/shared";
import { TEAM_CHIP, TEAM_TEXT } from "../lib/cards";
import { FaiziAnalysis } from "./FaiziAnalysis";
import { FaiziRoast } from "./FaiziRoast";

interface Props {
  team: Team;
  teamName: string;
  mvpNames: string[];
  room: RoomView | null;
  /** Set when Faizi analysis should be offered (current viewer's player id). */
  myPlayerId: string | null;
  onRematch: () => void;
  onLeave: () => void;
}

export function WinOverlay({ team, teamName, mvpNames, room, myPlayerId, onRematch, onLeave }: Props) {
  const [faiziOpen, setFaiziOpen] = useState(false);
  const [roastOpen, setRoastOpen] = useState(false);
  const canShowFaizi = !!(room?.gameId && myPlayerId);
  const canShowRoast = !!room?.gameId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="overlay-enter w-full max-w-sm rounded-3xl p-6 space-y-5 shadow-2xl"
        style={{ background: "var(--md-surface-1)" }}
      >
        <div className="text-center space-y-3">
          <div
            className={`mx-auto w-20 h-20 rounded-full border-4 flex items-center justify-center ${TEAM_CHIP[team]} shadow-lg`}
          >
            <svg viewBox="0 0 24 24" className="w-12 h-12 text-yellow-200 drop-shadow" fill="currentColor">
              <path d="M3 8l3.5 3 2.5-5 3 5 3-5 2.5 5L21 8l-1.6 9H4.6L3 8zm1.7 11h14.6v2H4.7v-2z" />
            </svg>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest" style={{ color: "var(--md-on-surface-variant)" }}>
              Winner
            </div>
            <h2 className={`text-3xl font-semibold tracking-tight ${TEAM_TEXT[team]}`}>
              {teamName}
            </h2>
            {mvpNames.length > 0 && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium bg-amber-400/15 border border-amber-400/40 text-amber-200">
                <span className="text-amber-300">★</span>
                MVP: {mvpNames.join(", ")}
              </div>
            )}
          </div>
        </div>

        {room && (
          <section className="rounded-2xl p-3 space-y-2" style={{ background: "var(--md-surface-2)" }}>
            <div className="text-xs uppercase tracking-widest" style={{ color: "var(--md-on-surface-variant)" }}>
              Scoreboard
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-sm">
              {(["red", "blue"] as Team[]).map((t) => (
                <div key={t} className="rounded-xl py-2" style={{ background: "var(--md-surface-3)" }}>
                  <div className={`text-xs uppercase tracking-wider ${TEAM_TEXT[t]}`}>
                    {room.teamNames[t]}
                  </div>
                  <div className="text-xl font-semibold">{room.teamScores[t]}</div>
                </div>
              ))}
            </div>
            {Object.keys(room.playerScores).length > 0 && (
              <ul className="space-y-1 text-sm pt-1">
                {Object.entries(room.playerScores)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([name, wins]) => (
                    <li
                      key={name}
                      className="flex items-center justify-between rounded-lg px-3 py-1.5"
                      style={{ background: "var(--md-surface-3)" }}
                    >
                      <span>{name}</span>
                      <span className="font-semibold text-amber-300">{wins}</span>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        )}

        {(canShowFaizi || canShowRoast) && (
          <div className="space-y-2">
            {canShowFaizi && (
              <button
                type="button"
                onClick={() => setFaiziOpen(true)}
                data-testid="faizi-open"
                className="state-layer w-full py-2.5 rounded-full font-medium text-indigo-100
                           bg-indigo-500/15 border border-indigo-400/40 hover:bg-indigo-500/25
                           transition-colors flex items-center justify-center gap-2"
              >
                <span>📊</span>
                <span>See Faizi's analysis of your moves</span>
              </button>
            )}
            {canShowRoast && (
              <button
                type="button"
                onClick={() => setRoastOpen(true)}
                data-testid="faizi-roast-open"
                className="state-layer w-full py-2.5 rounded-full font-medium text-fuchsia-100
                           bg-fuchsia-500/15 border border-fuchsia-400/40 hover:bg-fuchsia-500/25
                           transition-colors flex items-center justify-center gap-2"
              >
                <span>🎤</span>
                <span>Faizi roasts the table</span>
              </button>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onLeave}
            className="state-layer flex-1 py-3 rounded-full font-medium text-zinc-200
                       bg-transparent border border-zinc-700 hover:border-zinc-500
                       transition-colors"
          >
            Leave
          </button>
          <button
            type="button"
            onClick={onRematch}
            data-testid="rematch"
            className="state-layer flex-1 py-3 rounded-full font-medium text-indigo-50
                       bg-indigo-500 hover:bg-indigo-400 shadow-sm shadow-indigo-900/30
                       transition-colors"
          >
            Re-match
          </button>
        </div>
      </div>

      {faiziOpen && room?.gameId && myPlayerId && (
        <FaiziAnalysis
          gameId={room.gameId}
          playerId={myPlayerId}
          onClose={() => setFaiziOpen(false)}
        />
      )}
      {roastOpen && room?.gameId && (
        <FaiziRoast
          gameId={room.gameId}
          onClose={() => setRoastOpen(false)}
        />
      )}
    </div>
  );
}

import type { RoomView, Team } from "@fivefive/shared";
import { TEAM_CHIP, TEAM_TEXT } from "../lib/cards";
import { makeNickname } from "../lib/nickname";

interface Props {
  room: RoomView;
  onLeave: () => Promise<void>;
}

/**
 * Pre-game spectator view. The host hasn't started the game yet (or it just
 * ended) — show the lobby state read-only so the spectator knows who's in
 * and which teams have been picked. When the game starts the App will swap
 * this for the regular GameScreen automatically.
 */
export function SpectateLobby({ room, onLeave }: Props) {
  const teams: Team[] = ["red", "blue", "green"];
  return (
    <main
      className="min-h-screen flex flex-col items-center p-4 gap-4"
      style={{ background: "var(--md-surface)" }}
    >
      <header className="w-full max-w-md flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">👁</span>
          <div>
            <div className="text-xs uppercase tracking-widest" style={{ color: "var(--md-on-surface-variant)" }}>
              Spectating
            </div>
            <div className="text-lg font-medium tracking-tight">Room {room.code}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onLeave()}
          className="state-layer text-xs uppercase tracking-widest font-medium px-3 py-1 rounded-full border border-zinc-700 text-zinc-300 hover:text-white"
        >
          Leave
        </button>
      </header>

      <section
        className="w-full max-w-md rounded-3xl p-5 space-y-3 shadow-sm"
        style={{ background: "var(--md-surface-1)" }}
      >
        <div className="text-sm" style={{ color: "var(--md-on-surface-variant)" }}>
          Waiting for the host to start the game. Other spectators here: {Math.max(0, room.spectatorCount - 1)}.
        </div>

        <div className="space-y-2">
          {teams.map((t) => {
            const players = room.seats.filter((s) => s.team === t);
            if (players.length === 0) return null;
            return (
              <div key={t} className="rounded-2xl p-3" style={{ background: "var(--md-surface-2)" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className={`text-xs uppercase tracking-widest font-semibold ${TEAM_TEXT[t]}`}>
                    {room.teamNames[t]}
                  </div>
                  <div className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>
                    {players.length} player{players.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {players.map((p) => (
                    <div
                      key={p.id}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${TEAM_CHIP[t]}`}
                      style={{
                        boxShadow:
                          "inset 0 1px 2px rgba(255,255,255,0.35), inset 0 -1.5px 2px rgba(0,0,0,0.25)",
                      }}
                    >
                      <span className="text-white text-xs font-bold tracking-wide leading-none">
                        {makeNickname(p.name)}
                      </span>
                      {p.ready && (
                        <span className="text-amber-200 text-[0.55rem] uppercase tracking-widest font-semibold leading-none">
                          ready
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {room.seats.length === 0 && (
          <p className="text-center text-sm py-4" style={{ color: "var(--md-on-surface-variant)" }}>
            Lobby is empty.
          </p>
        )}
      </section>
    </main>
  );
}

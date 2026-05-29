import { useState } from "react";
import type { PlayerId, RoomView, Team } from "@sequence/shared";
import { TEAM_CHIP, TEAM_LABEL } from "../lib/cards";

interface Props {
  room: RoomView;
  myPlayerId: PlayerId;
  connected: boolean;
  error: string | null;
  onClearError: () => void;
  onChooseTeam: (team: Team) => Promise<void>;
  onSetReady: (ready: boolean) => Promise<void>;
  onStart: (opts: { sequencesToWin: number }) => Promise<void>;
  onLeave: () => Promise<void>;
}

export function LobbyScreen({
  room,
  myPlayerId,
  connected,
  error,
  onClearError,
  onChooseTeam,
  onSetReady,
  onStart,
  onLeave,
}: Props) {
  const mySeat = room.seats.find((s) => s.id === myPlayerId);
  const isHost = mySeat?.isHost ?? false;
  const [sequencesToWin, setSequencesToWin] = useState(2);

  // Heuristic for whether the host can start.
  const teamsPresent = new Set(room.seats.map((s) => s.team).filter(Boolean));
  const allReady = room.seats.length >= 2 && room.seats.every((s) => s.team && s.ready);
  const teamCounts = new Map<Team, number>();
  for (const s of room.seats) {
    if (s.team) teamCounts.set(s.team, (teamCounts.get(s.team) ?? 0) + 1);
  }
  const teamsBalanced =
    teamCounts.size >= 2 &&
    [...teamCounts.values()].every((n) => n === [...teamCounts.values()][0]);
  const canStart = allReady && teamsBalanced;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center p-4 gap-4">
      <header className="w-full max-w-md text-center space-y-1">
        <h1 className="text-2xl font-bold">Sequence</h1>
        <p className="text-slate-400 text-sm">
          {connected ? "Online" : "Reconnecting…"}
        </p>
      </header>

      <div className="w-full max-w-md bg-slate-800/60 rounded-lg p-4 space-y-3 text-center">
        <div className="text-xs uppercase text-slate-400 tracking-widest">
          Room code
        </div>
        <div className="text-4xl font-mono font-bold tracking-[0.3em]">
          {room.code}
        </div>
        <div className="text-xs text-slate-400">
          Share this code so friends can join.
        </div>
      </div>

      {error && (
        <div className="w-full max-w-md bg-rose-700/80 px-3 py-2 rounded text-sm flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={onClearError}
            className="text-rose-100 underline text-xs"
          >
            dismiss
          </button>
        </div>
      )}

      <div className="w-full max-w-md space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-slate-400">
          Players ({room.seats.length})
        </h2>
        <ul className="space-y-1.5">
          {room.seats.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 bg-slate-800/60 rounded px-3 py-2"
            >
              <span
                className={`inline-block w-3 h-3 rounded-full border ${
                  s.team ? TEAM_CHIP[s.team] : "bg-slate-600 border-slate-500"
                }`}
              />
              <span className="font-medium truncate">{s.name}</span>
              {s.isHost && (
                <span className="text-amber-300 text-xs">host</span>
              )}
              {s.id === myPlayerId && (
                <span className="text-emerald-300 text-xs">you</span>
              )}
              <span className="ml-auto flex items-center gap-2 text-xs">
                {!s.connected && (
                  <span className="text-rose-400">offline</span>
                )}
                {s.team && (
                  <span className="text-slate-300">{TEAM_LABEL[s.team]}</span>
                )}
                {s.ready ? (
                  <span className="text-emerald-400">ready</span>
                ) : (
                  <span className="text-slate-500">not ready</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="w-full max-w-md space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-slate-400">
          Pick your team
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {(["red", "blue"] as Team[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChooseTeam(t)}
              className={`py-2 rounded font-semibold border-2 ${
                mySeat?.team === t
                  ? `${TEAM_CHIP[t]} text-white`
                  : "bg-slate-800 border-slate-700 hover:border-slate-500"
              }`}
            >
              {TEAM_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full max-w-md space-y-2">
        <button
          type="button"
          disabled={!mySeat?.team}
          onClick={() => onSetReady(!mySeat?.ready)}
          className={`w-full py-3 rounded font-semibold ${
            mySeat?.ready
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
          }`}
        >
          {mySeat?.ready ? "Ready ✓ (tap to un-ready)" : "Mark ready"}
        </button>
      </div>

      {isHost && (
        <div className="w-full max-w-md bg-slate-800/40 rounded-lg p-3 space-y-3">
          <h2 className="text-sm uppercase tracking-widest text-slate-400">
            Host controls
          </h2>
          <label className="flex items-center justify-between text-sm">
            <span className="text-slate-300">Sequences to win</span>
            <select
              value={sequencesToWin}
              onChange={(e) => setSequencesToWin(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1"
            >
              <option value={1}>1</option>
              <option value={2}>2 (standard)</option>
            </select>
          </label>
          <button
            type="button"
            disabled={!canStart}
            onClick={() => onStart({ sequencesToWin })}
            className="w-full py-3 rounded bg-amber-500 text-slate-900 font-bold hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-400"
          >
            Start game
          </button>
          {!canStart && (
            <p className="text-xs text-slate-400">
              {room.seats.length < 2
                ? "Need at least 2 players."
                : !teamsBalanced
                  ? "Teams must be even (same number on each side)."
                  : "Everyone needs to mark ready."}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onLeave}
        className="text-slate-400 hover:text-rose-300 underline text-sm mt-2"
      >
        Leave room
      </button>
    </div>
  );
}

import { useEffect, useState } from "react";
import type { ReplaySummary, Team } from "@sequence/shared";
import { TEAM_TEXT } from "../lib/cards";

interface Props {
  onClose: () => void;
  onOpenReplay: (gameId: string) => void;
}

const ASSET_BASE =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? "http://localhost:3001" : "");

export function ReplayListDialog({ onClose, onOpenReplay }: Props) {
  const [replays, setReplays] = useState<ReplaySummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${ASSET_BASE}/api/replays?limit=30`)
      .then((r) => (r.ok ? r.json() : { replays: [] }))
      .then((d: { replays: ReplaySummary[] }) => {
        if (!cancelled) setReplays(d.replays ?? []);
      })
      .catch(() => {
        if (!cancelled) setReplays([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overlay-enter"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="replay-list-dialog"
    >
      <div
        className="w-full max-w-md max-h-[85vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden"
        style={{ background: "var(--md-surface-1)" }}
      >
        <header
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--md-outline)" }}
        >
          <div>
            <h2 className="text-lg font-medium tracking-tight">Replays</h2>
            <p className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>
              The 30 most recent finished games
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="state-layer text-zinc-300 hover:text-white px-3 py-1 rounded-full text-sm"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {replays === null && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-16 rounded-2xl animate-pulse"
                  style={{ background: "var(--md-surface-2)" }}
                />
              ))}
            </div>
          )}
          {replays !== null && replays.length === 0 && (
            <p
              className="text-sm text-center py-8"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              No completed games yet. Play one to start the replay archive.
            </p>
          )}
          {replays !== null &&
            replays.map((r) => (
              <ReplayRow
                key={r.gameId}
                replay={r}
                onClick={() => onOpenReplay(r.gameId)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function ReplayRow({
  replay,
  onClick,
}: {
  replay: ReplaySummary;
  onClick: () => void;
}) {
  const when = replay.finishedAt ? timeAgo(new Date(replay.finishedAt)) : "—";
  const winner = replay.winningTeam;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`replay-${replay.gameId}`}
      className="state-layer w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:brightness-110 transition"
      style={{ background: "var(--md-surface-2)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {replay.playerNames.slice(0, 4).join(", ")}
          {replay.playerNames.length > 4 ? " +…" : ""}
        </div>
        <div
          className="text-xs flex items-center gap-2 flex-wrap"
          style={{ color: "var(--md-on-surface-variant)" }}
        >
          <span>{when}</span>
          <span>·</span>
          <span>{replay.actionCount} moves</span>
          {winner && replay.winningTeamName && (
            <>
              <span>·</span>
              <span className={`font-semibold ${TEAM_TEXT[winner as Team]}`}>
                {replay.winningTeamName} won
              </span>
            </>
          )}
        </div>
      </div>
      <span className="text-zinc-500 text-lg">›</span>
    </button>
  );
}

function timeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
}

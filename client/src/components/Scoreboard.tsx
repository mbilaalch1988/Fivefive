import { useEffect, useState } from "react";
import type { ScoreboardEntry, ScoreboardResponse } from "@sequence/shared";

interface Props {
  /** When true, render as a full-screen Material dialog with close button. */
  asDialog?: boolean;
  onClose?: () => void;
}

const ASSET_BASE =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? "http://localhost:3001" : "");

async function fetchScoreboard(): Promise<ScoreboardResponse> {
  try {
    const r = await fetch(`${ASSET_BASE}/api/scoreboard`);
    if (!r.ok) return { topPlayers: [], topTeams: [], persisted: false };
    return (await r.json()) as ScoreboardResponse;
  } catch {
    return { topPlayers: [], topTeams: [], persisted: false };
  }
}

export function Scoreboard({ asDialog, onClose }: Props) {
  const [data, setData] = useState<ScoreboardResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchScoreboard().then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const content = (
    <ScoreboardBody data={data} />
  );

  if (!asDialog) return content;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overlay-enter"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="w-full max-w-md rounded-3xl shadow-2xl"
        style={{ background: "var(--md-surface-1)" }}
      >
        <header
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--md-outline)" }}
        >
          <h2 className="text-lg font-medium tracking-tight">Scoreboard</h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="scoreboard-close"
            className="state-layer text-zinc-300 hover:text-white px-3 py-1 rounded-full text-sm"
          >
            Close
          </button>
        </header>
        <div className="p-5">{content}</div>
      </div>
    </div>
  );
}

function ScoreboardBody({ data }: { data: ScoreboardResponse | null }) {
  if (data === null) {
    return (
      <div className="space-y-4">
        <Skeleton />
        <Skeleton />
      </div>
    );
  }
  if (!data.persisted) {
    return (
      <p className="text-sm text-center" style={{ color: "var(--md-on-surface-variant)" }}>
        Leaderboards become available once persistent storage is configured.
      </p>
    );
  }
  if (data.topPlayers.length === 0 && data.topTeams.length === 0) {
    return (
      <p className="text-sm text-center" style={{ color: "var(--md-on-surface-variant)" }}>
        No games completed yet. Be the first to make history.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      <LeaderTable title="Top players" rows={data.topPlayers} />
      <LeaderTable title="Top teams" rows={data.topTeams} />
    </div>
  );
}

function LeaderTable({ title, rows }: { title: string; rows: ScoreboardEntry[] }) {
  return (
    <section>
      <h3
        className="text-xs uppercase tracking-widest mb-2"
        style={{ color: "var(--md-on-surface-variant)" }}
      >
        {title}
      </h3>
      {rows.length === 0 ? (
        <div
          className="rounded-2xl px-3 py-2 text-sm"
          style={{ background: "var(--md-surface-2)", color: "var(--md-on-surface-variant)" }}
        >
          No entries yet.
        </div>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li
              key={r.name}
              className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm"
              style={{ background: "var(--md-surface-2)" }}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                  i === 0
                    ? "bg-amber-400 text-zinc-900"
                    : i === 1
                      ? "bg-zinc-300 text-zinc-900"
                      : i === 2
                        ? "bg-amber-700 text-amber-50"
                        : "bg-zinc-700 text-zinc-200"
                }`}
              >
                {i + 1}
              </span>
              <span className="flex-1 truncate font-medium">{r.name}</span>
              <span className="text-right">
                <div className="font-semibold">{r.wins}<span className="font-normal text-xs opacity-70"> / {r.games}</span></div>
                <div className="text-[0.65rem]" style={{ color: "var(--md-on-surface-variant)" }}>
                  {(r.ratio * 100).toFixed(0)}% win rate
                </div>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="h-3 w-24 rounded-full" style={{ background: "var(--md-surface-2)" }} />
      <div className="h-9 w-full rounded-2xl animate-pulse" style={{ background: "var(--md-surface-2)" }} />
      <div className="h-9 w-full rounded-2xl animate-pulse" style={{ background: "var(--md-surface-2)" }} />
    </div>
  );
}

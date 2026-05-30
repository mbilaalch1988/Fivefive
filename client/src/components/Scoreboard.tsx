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
  const fallback: ScoreboardResponse = {
    topPlayers: [],
    topTeams: [],
    topPlayersBySequences: [],
    topPlayersByMvp: [],
    persisted: false,
  };
  try {
    const r = await fetch(`${ASSET_BASE}/api/scoreboard`);
    if (!r.ok) return fallback;
    return (await r.json()) as ScoreboardResponse;
  } catch {
    return fallback;
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

  const body = <ScoreboardBody data={data} expanded={!!asDialog} />;

  if (!asDialog) return body;

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
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl"
        style={{ background: "var(--md-surface-1)" }}
      >
        <header
          className="sticky top-0 flex items-center justify-between px-5 py-4 border-b backdrop-blur"
          style={{ borderColor: "var(--md-outline)", background: "var(--md-surface-1)" }}
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
        <div className="p-5">{body}</div>
      </div>
    </div>
  );
}

function ScoreboardBody({
  data,
  expanded,
}: {
  data: ScoreboardResponse | null;
  expanded: boolean;
}) {
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
  const empty =
    data.topPlayers.length === 0 &&
    data.topTeams.length === 0 &&
    data.topPlayersBySequences.length === 0 &&
    data.topPlayersByMvp.length === 0;
  if (empty) {
    return (
      <p className="text-sm text-center" style={{ color: "var(--md-on-surface-variant)" }}>
        No games completed yet. Be the first to make history.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      <LeaderTable title="Top players by wins" rows={data.topPlayers} variant="wins" />
      <LeaderTable title="Top teams by wins" rows={data.topTeams} variant="wins" />
      {expanded && (
        <>
          <LeaderTable
            title="Top players by sequences closed"
            rows={data.topPlayersBySequences}
            variant="sequences"
          />
          <LeaderTable
            title="Top MVPs"
            rows={data.topPlayersByMvp}
            variant="mvp"
          />
        </>
      )}
    </div>
  );
}

function LeaderTable({
  title,
  rows,
  variant,
}: {
  title: string;
  rows: ScoreboardEntry[];
  variant: "wins" | "sequences" | "mvp";
}) {
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
              <RankBadge index={i} />
              <span className="flex-1 truncate font-medium flex items-center gap-1">
                {r.name}
                {r.verified && (
                  <span
                    title="Verified account"
                    className="text-indigo-300 text-xs"
                    aria-label="verified"
                  >
                    ✓
                  </span>
                )}
              </span>
              <RankValue row={r} variant={variant} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RankBadge({ index }: { index: number }) {
  const styles = [
    "bg-amber-400 text-zinc-900",
    "bg-zinc-300 text-zinc-900",
    "bg-amber-700 text-amber-50",
    "bg-zinc-700 text-zinc-200",
    "bg-zinc-700 text-zinc-200",
  ];
  return (
    <span
      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${styles[index] ?? styles[4]}`}
    >
      {index + 1}
    </span>
  );
}

function RankValue({
  row,
  variant,
}: {
  row: ScoreboardEntry;
  variant: "wins" | "sequences" | "mvp";
}) {
  if (variant === "sequences") {
    return (
      <span className="text-right">
        <div className="font-semibold">{row.sequencesClosed ?? 0}</div>
        <div className="text-[0.65rem]" style={{ color: "var(--md-on-surface-variant)" }}>
          across {row.games} game{row.games === 1 ? "" : "s"}
        </div>
      </span>
    );
  }
  if (variant === "mvp") {
    return (
      <span className="text-right">
        <div className="font-semibold">{row.mvpGames ?? 0}</div>
        <div className="text-[0.65rem]" style={{ color: "var(--md-on-surface-variant)" }}>
          {row.games > 0 ? (((row.mvpGames ?? 0) / row.games) * 100).toFixed(0) : 0}% of games
        </div>
      </span>
    );
  }
  return (
    <span className="text-right">
      <div className="font-semibold">
        {row.wins}
        <span className="font-normal text-xs opacity-70"> / {row.games}</span>
      </div>
      <div className="text-[0.65rem]" style={{ color: "var(--md-on-surface-variant)" }}>
        {(row.ratio * 100).toFixed(0)}% win rate
      </div>
    </span>
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

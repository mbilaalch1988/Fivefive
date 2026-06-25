import { useEffect, useState } from "react";
import type { FaiziAnalysis as FaiziData, FaiziMove, FaiziRating } from "@fivefive/shared";

interface Props {
  gameId: string;
  playerId: string;
  onClose: () => void;
}

const ASSET_BASE =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? "http://localhost:3001" : "");

const RATING_META: Record<FaiziRating, { label: string; color: string; bg: string; icon: string }> = {
  best:    { label: "Best move",   color: "text-emerald-200", bg: "bg-emerald-500/15 border-emerald-400/40", icon: "🏆" },
  solid:   { label: "Solid",       color: "text-sky-200",     bg: "bg-sky-500/15 border-sky-400/40",         icon: "✓" },
  missed:  { label: "Missed",      color: "text-amber-200",   bg: "bg-amber-500/15 border-amber-400/40",     icon: "⚠" },
  mistake: { label: "Mistake",     color: "text-rose-200",    bg: "bg-rose-500/15 border-rose-400/40",       icon: "❌" },
};

export function FaiziAnalysis({ gameId, playerId, onClose }: Props) {
  const [data, setData] = useState<FaiziData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${ASSET_BASE}/api/replays/${gameId}/faizi?playerId=${encodeURIComponent(playerId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((d: FaiziData) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, playerId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 overlay-enter"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Faizi analysis"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="faizi-modal"
    >
      <div
        className="w-full max-w-md max-h-[88vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden"
        style={{ background: "var(--md-surface-1)" }}
      >
        <header
          className="px-5 py-4 border-b flex items-center justify-between"
          style={{ borderColor: "var(--md-outline)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-ff-gold/20 border border-ff-gold/40 flex items-center justify-center text-lg shrink-0">
              📊
            </div>
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-widest" style={{ color: "var(--md-on-surface-variant)" }}>
                Faizi's analysis
              </div>
              <div className="text-sm font-medium truncate">Coach review of your moves</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full hover:bg-ff-navy-card/50 flex items-center justify-center text-zinc-400 hover:text-ff-cream shrink-0"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <p className="text-sm text-rose-300">Couldn't load analysis: {error}</p>
          )}
          {!data && !error && <Skeleton />}
          {data && !data.available && (
            <p
              className="text-sm text-center py-6"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              {data.notes ?? "No analysis available."}
            </p>
          )}
          {data && data.available && (
            <>
              <SummaryStrip summary={data.summary} totalMoves={data.moves.length} />
              {data.moves.length === 0 ? (
                <p
                  className="text-sm text-center py-6"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  No scorable moves this game.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.moves.map((m, i) => (
                    <MoveRow key={i} move={m} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryStrip({
  summary,
  totalMoves,
}: {
  summary: { best: number; solid: number; missed: number; mistake: number };
  totalMoves: number;
}) {
  const good = summary.best + summary.solid;
  const goodPct = totalMoves ? Math.round((good / totalMoves) * 100) : 0;
  return (
    <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--md-surface-2)" }}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-widest" style={{ color: "var(--md-on-surface-variant)" }}>
          Move quality
        </span>
        <span className="text-2xl font-bold text-emerald-300 tabular-nums">{goodPct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-ff-navy-soft overflow-hidden">
        <div className="h-full bg-emerald-400" style={{ width: `${goodPct}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs">
        <BadgePill label={`${summary.best} best`} cls="text-emerald-200" />
        <BadgePill label={`${summary.solid} solid`} cls="text-sky-200" />
        <BadgePill label={`${summary.missed} missed`} cls="text-amber-200" />
        <BadgePill label={`${summary.mistake} mistakes`} cls="text-rose-200" />
      </div>
    </div>
  );
}

function BadgePill({ label, cls }: { label: string; cls: string }) {
  return <span className={`tabular-nums ${cls}`}>{label}</span>;
}

function MoveRow({ move }: { move: FaiziMove }) {
  const meta = RATING_META[move.rating];
  return (
    <li
      className={`rounded-2xl border px-3 py-2.5 flex items-start gap-3 ${meta.bg}`}
    >
      <span className="text-lg leading-none shrink-0 mt-0.5">{meta.icon}</span>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className={`text-xs uppercase tracking-widest font-semibold ${meta.color}`}>
            {meta.label}
          </span>
          <span className="text-xs text-zinc-400 tabular-nums">#{move.actionIndex + 1}</span>
        </div>
        <div className="text-sm text-ff-cream">
          You {move.played}.
        </div>
        <div className="text-xs text-zinc-300 leading-snug">
          {move.summary}
        </div>
      </div>
    </li>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="h-20 rounded-2xl animate-pulse" style={{ background: "var(--md-surface-2)" }} />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-14 rounded-2xl animate-pulse" style={{ background: "var(--md-surface-2)" }} />
      ))}
    </div>
  );
}

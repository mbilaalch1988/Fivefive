import { useEffect, useState } from "react";
import type { FaiziRoast as RoastData, RoastPlayer, Team } from "@fivefive/shared";
import { TEAM_CHIP, TEAM_TEXT } from "../lib/cards";

interface Props {
  gameId: string;
  onClose: () => void;
}

const ASSET_BASE =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? "http://localhost:3001" : "");

export function FaiziRoast({ gameId, onClose }: Props) {
  const [data, setData] = useState<RoastData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${ASSET_BASE}/api/replays/${gameId}/faizi/roast`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((d: RoastData) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

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
      aria-label="Faizi roast"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="faizi-roast-modal"
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
            <div className="w-10 h-10 rounded-full bg-ff-coral/20 border border-ff-coral/40 flex items-center justify-center text-lg shrink-0">
              🎤
            </div>
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-widest" style={{ color: "var(--md-on-surface-variant)" }}>
                Faizi roasts the table
              </div>
              <div className="text-sm font-medium truncate">Everyone's moves, judged with love</div>
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
            <p className="text-sm text-rose-300">Couldn't load roast: {error}</p>
          )}
          {!data && !error && <Skeleton />}
          {data && !data.available && (
            <p
              className="text-sm text-center py-6"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              {data.notes ?? "No roast available."}
            </p>
          )}
          {data && data.available && (
            <>
              {data.headline && (
                <p
                  className="text-sm italic text-center px-4"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  "{data.headline}"
                </p>
              )}

              {data.awards.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs uppercase tracking-widest" style={{ color: "var(--md-on-surface-variant)" }}>
                    🏆 Awards ceremony
                  </h3>
                  <ul className="space-y-2">
                    {data.awards.map((a) => (
                      <li
                        key={a.id}
                        className="rounded-2xl px-3 py-2 flex items-start gap-3 border border-amber-400/30"
                        style={{ background: "rgba(251, 191, 36, 0.08)" }}
                      >
                        <span className="text-2xl leading-none shrink-0">{a.icon}</span>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="text-xs uppercase tracking-widest font-semibold text-amber-200">
                            {a.title}
                          </div>
                          <div className="text-sm text-ff-cream">
                            <span className="font-semibold">{a.winnerName}</span>
                            <span className="text-zinc-300"> — {a.detail}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="space-y-2">
                <h3 className="text-xs uppercase tracking-widest" style={{ color: "var(--md-on-surface-variant)" }}>
                  📋 Verdicts by player
                </h3>
                <ul className="space-y-2">
                  {data.players.map((p) => (
                    <PlayerCard key={p.playerId} player={p} />
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerCard({ player: p }: { player: RoastPlayer }) {
  const team: Team = p.team;
  return (
    <li
      className="rounded-2xl p-3 space-y-2"
      style={{ background: "var(--md-surface-2)" }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold ${TEAM_CHIP[team]}`}
          style={{ border: "2px solid #18181b" }}
        >
          <span className="text-white">{p.name}</span>
        </span>
        <span className={`text-xs ${TEAM_TEXT[team]}`}>·</span>
        <span className="text-2xl font-bold tabular-nums text-emerald-300 ml-auto">
          {p.qualityPct}%
        </span>
      </div>
      <div className="text-sm font-semibold text-ff-cream">{p.title}</div>
      <div className="text-xs italic" style={{ color: "var(--md-on-surface-variant)" }}>
        "{p.tagline}"
      </div>
      <div className="flex items-center gap-3 text-[0.65rem] uppercase tracking-widest font-semibold pt-1">
        <span className="text-emerald-300">{p.summary.best} best</span>
        <span className="text-sky-300">{p.summary.solid} solid</span>
        <span className="text-amber-300">{p.summary.missed} missed</span>
        <span className="text-rose-300">{p.summary.mistake} mistakes</span>
      </div>
    </li>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-3/4 mx-auto rounded animate-pulse" style={{ background: "var(--md-surface-2)" }} />
      <div className="h-16 rounded-2xl animate-pulse" style={{ background: "var(--md-surface-2)" }} />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "var(--md-surface-2)" }} />
      ))}
    </div>
  );
}

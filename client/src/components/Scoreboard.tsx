import { useEffect, useRef, useState } from "react";
import type {
  AchievementStatus,
  PaginatedScoreboard,
  ScoreboardEntry,
  ScoreboardResponse,
} from "@fivefive/shared";
import { computeAchievements } from "@fivefive/shared";

interface Props {
  asDialog?: boolean;
  onClose?: () => void;
}

const ASSET_BASE =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? "http://localhost:3001" : "");

const PER_PAGE = 10;

async function fetchScoreboardSummary(): Promise<ScoreboardResponse> {
  const fallback: ScoreboardResponse = {
    topPlayersByPoints: [],
    topPlayers: [],
    topTeams: [],
    topPlayersByFivefives: [],
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

async function fetchPagedPlayers(page: number): Promise<PaginatedScoreboard> {
  return fetchPaged("players", page);
}
async function fetchPagedTeams(page: number): Promise<PaginatedScoreboard> {
  return fetchPaged("teams", page);
}
async function fetchPaged(
  endpoint: "players" | "teams",
  page: number,
): Promise<PaginatedScoreboard> {
  const fallback: PaginatedScoreboard = { rows: [], total: 0, page, perPage: PER_PAGE };
  try {
    const r = await fetch(
      `${ASSET_BASE}/api/scoreboard/${endpoint}?page=${page}&perPage=${PER_PAGE}`,
    );
    if (!r.ok) return fallback;
    return (await r.json()) as PaginatedScoreboard;
  } catch {
    return fallback;
  }
}

export function Scoreboard({ asDialog, onClose }: Props) {
  if (asDialog) {
    return <ScoreboardDialog onClose={onClose ?? (() => undefined)} />;
  }
  return <ScoreboardInline />;
}

/* ------------------------------------------------------------ */
/* Inline (compact landing screen) view                          */
/* ------------------------------------------------------------ */

function ScoreboardInline() {
  const [data, setData] = useState<ScoreboardResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchScoreboardSummary().then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (data === null) return <Skeletons />;
  if (!data.persisted) {
    return (
      <p className="text-sm text-center" style={{ color: "var(--md-on-surface-variant)" }}>
        Leaderboards become available once persistent storage is configured.
      </p>
    );
  }
  if (data.topPlayersByPoints.length === 0 && data.topTeams.length === 0) {
    return (
      <p className="text-sm text-center" style={{ color: "var(--md-on-surface-variant)" }}>
        No games completed yet. Be the first to make history.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      <LeaderTable title="Top players by points" rows={data.topPlayersByPoints} variant="points" />
      <LeaderTable title="Top teams by wins" rows={data.topTeams} variant="wins" />
    </div>
  );
}

/* ------------------------------------------------------------ */
/* Dialog (full paginated leaderboards)                          */
/* ------------------------------------------------------------ */

type DialogTab = "players" | "teams";

function ScoreboardDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<DialogTab>("players");
  const [playersPage, setPlayersPage] = useState(0);
  const [teamsPage, setTeamsPage] = useState(0);
  const [playersData, setPlayersData] = useState<PaginatedScoreboard | null>(null);
  const [teamsData, setTeamsData] = useState<PaginatedScoreboard | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  // Probe persistence state once via the summary endpoint; cheap.
  useEffect(() => {
    let cancelled = false;
    void fetchScoreboardSummary().then((s) => {
      if (!cancelled) setPersisted(s.persisted);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (tab !== "players") return;
    let cancelled = false;
    setPlayersData(null);
    void fetchPagedPlayers(playersPage).then((d) => {
      if (!cancelled) setPlayersData(d);
    });
    return () => { cancelled = true; };
  }, [tab, playersPage]);

  useEffect(() => {
    if (tab !== "teams") return;
    let cancelled = false;
    setTeamsData(null);
    void fetchPagedTeams(teamsPage).then((d) => {
      if (!cancelled) setTeamsData(d);
    });
    return () => { cancelled = true; };
  }, [tab, teamsPage]);

  const activeData = tab === "players" ? playersData : teamsData;
  const activePage = tab === "players" ? playersPage : teamsPage;
  const setActivePage = tab === "players" ? setPlayersPage : setTeamsPage;
  const variant: TableVariant = tab === "players" ? "points" : "wins";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overlay-enter"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden"
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

        {/* Tabs */}
        <div
          className="flex border-b"
          style={{ borderColor: "var(--md-outline)" }}
        >
          <TabButton
            label={`Players${playersData ? ` (${playersData.total})` : ""}`}
            active={tab === "players"}
            onClick={() => setTab("players")}
          />
          <TabButton
            label={`Teams${teamsData ? ` (${teamsData.total})` : ""}`}
            active={tab === "teams"}
            onClick={() => setTab("teams")}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {persisted === false ? (
            <p
              className="text-sm text-center"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              Leaderboards become available once persistent storage is configured.
            </p>
          ) : activeData === null ? (
            <Skeletons />
          ) : activeData.rows.length === 0 ? (
            <p
              className="text-sm text-center"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              {activePage === 0
                ? "No entries yet."
                : "No more entries on this page."}
            </p>
          ) : (
            <>
              <LeaderTable
                title={tab === "players" ? "Ranked by points" : "Ranked by wins"}
                rows={activeData.rows}
                variant={variant}
                offset={activeData.page * activeData.perPage}
              />
              <Pagination
                total={activeData.total}
                page={activeData.page}
                perPage={activeData.perPage}
                onChange={setActivePage}
              />
              {tab === "players" && (
                <p
                  className="text-[0.65rem] text-center pt-3"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  Points = sequences × 5 + winning sequences × 5 + MVPs × 10
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-3 text-xs uppercase tracking-widest font-medium transition-colors state-layer
        ${active ? "text-indigo-300" : "text-zinc-400 hover:text-zinc-200"}`}
      style={{
        borderBottom: active ? "2px solid #818cf8" : "2px solid transparent",
      }}
    >
      {label}
    </button>
  );
}

function Pagination({
  total,
  page,
  perPage,
  onChange,
}: {
  total: number;
  page: number;
  perPage: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 pt-4 text-sm">
      <button
        type="button"
        disabled={page <= 0}
        onClick={() => onChange(page - 1)}
        className="state-layer px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-200 disabled:opacity-40"
      >
        ← Prev
      </button>
      <span style={{ color: "var(--md-on-surface-variant)" }}>
        Page <span className="text-zinc-200 font-semibold">{page + 1}</span> of {totalPages}
      </span>
      <button
        type="button"
        disabled={page + 1 >= totalPages}
        onClick={() => onChange(page + 1)}
        className="state-layer px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-200 disabled:opacity-40"
      >
        Next →
      </button>
    </div>
  );
}

/* ------------------------------------------------------------ */
/* Shared leader table + row detail                              */
/* ------------------------------------------------------------ */

type TableVariant = "points" | "wins" | "sequences" | "mvp";

function LeaderTable({
  title,
  rows,
  variant,
  offset = 0,
}: {
  title: string;
  rows: ScoreboardEntry[];
  variant: TableVariant;
  offset?: number;
}) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const isTeamTable = !rows.some((r) => r.points !== undefined);
  const canExpand = !isTeamTable;

  return (
    <section>
      <h3
        className="text-xs uppercase tracking-widest mb-2"
        style={{ color: "var(--md-on-surface-variant)" }}
      >
        {title}
      </h3>
      <ol className="space-y-1.5">
        {rows.map((r, i) => {
          const rankIndex = offset + i;
          const key = `${r.name}-${r.verified ? "v" : "a"}-${rankIndex}`;
          const isExpanded = expandedRow === key;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={canExpand ? () => setExpandedRow(isExpanded ? null : key) : undefined}
                disabled={!canExpand}
                className={`w-full flex items-center gap-3 rounded-2xl px-3 py-2 text-sm text-left transition-colors ${
                  canExpand ? "state-layer hover:brightness-110 cursor-pointer" : "cursor-default"
                }`}
                style={{ background: "var(--md-surface-2)" }}
              >
                <RankBadge index={rankIndex} />
                <span className="flex-1 min-w-0 font-medium flex flex-col gap-0.5">
                  <span className="truncate flex items-center gap-1">
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
                  {canExpand && <BadgeStrip row={r} />}
                </span>
                <RankValue row={r} variant={variant} />
                {canExpand && (
                  <span className={`text-zinc-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                    ▾
                  </span>
                )}
              </button>
              {isExpanded && canExpand && <PlayerDetail row={r} />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function PlayerDetail({ row }: { row: ScoreboardEntry }) {
  const seq = row.fivefivesClosed ?? 0;
  const winSeq = row.winningFivefivesClosed ?? 0;
  const mvp = row.mvpGames ?? 0;
  const total = row.points ?? 0;
  const achievements = computeAchievements(row);
  const earnedCount = achievements.filter((a) => a.earned).length;

  return (
    <div
      className="mt-1 rounded-2xl px-4 py-3 text-xs space-y-3"
      style={{
        background: "var(--md-surface-3)",
        color: "var(--md-on-surface-variant)",
      }}
    >
      <div className="space-y-1.5">
        <DetailRow label="Wins" value={`${row.wins} of ${row.games} (${(row.ratio * 100).toFixed(0)}%)`} />
        <DetailRow label="Sequences closed" value={`${seq}`} extra={`+${seq * 5} pts`} />
        <DetailRow label="Game-winning sequences" value={`${winSeq}`} extra={`+${winSeq * 5} pts`} />
        <DetailRow label="MVP games" value={`${mvp}`} extra={`+${mvp * 10} pts`} />
        <div
          className="border-t pt-2 mt-2 flex items-center justify-between text-sm font-semibold text-zinc-100"
          style={{ borderColor: "var(--md-outline)" }}
        >
          <span>Total points</span>
          <span className="text-amber-300">{total}</span>
        </div>
      </div>

      <div className="border-t pt-3" style={{ borderColor: "var(--md-outline)" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="uppercase tracking-widest font-semibold text-zinc-300">
            Achievements
          </span>
          <span className="text-amber-300/90 font-medium tabular-nums">
            {earnedCount} / {achievements.length}
          </span>
        </div>
        {/* Overall progress bar — quick visual read of total completion. */}
        <div className="h-1.5 rounded-full bg-zinc-800/80 overflow-hidden mb-3">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-200 transition-all"
            style={{
              width: `${Math.round((earnedCount / achievements.length) * 100)}%`,
            }}
          />
        </div>
        {/* Sort: earned first (rarity desc), then locked (progress desc).
            Surfaces accomplishments at a glance and chases at the bottom.
            4 cols = 20 achievements / 4 = exactly 5 rows, no orphans. */}
        <div className="grid grid-cols-4 gap-1.5">
          {[...achievements]
            .sort((a, b) => {
              if (a.earned !== b.earned) return a.earned ? -1 : 1;
              if (a.earned) {
                return TIER_RANK[a.info.tier] - TIER_RANK[b.info.tier];
              }
              return (
                b.current / b.info.target - a.current / a.info.target
              );
            })
            .map((a) => (
              <AchievementCell key={a.info.id} a={a} />
            ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ */
/* Achievement badges                                            */
/* ------------------------------------------------------------ */

/**
 * Tier styling. Each tier gets a distinct gradient + ring color so a
 * glance at the badge strip immediately conveys rarity:
 *  - bronze: warm amber-brown
 *  - silver: cool slate
 *  - gold:   bright amber with a soft glow
 */
type Tier = "bronze" | "silver" | "gold";
const TIER_STYLES: Record<
  Tier,
  { ring: string; bg: string; text: string; glow: string; barFill: string }
> = {
  bronze: {
    ring: "border-amber-700/80",
    bg: "bg-gradient-to-br from-amber-700/50 to-amber-950/60",
    text: "text-amber-300",
    glow: "",
    barFill: "bg-amber-500",
  },
  silver: {
    ring: "border-slate-300/70",
    bg: "bg-gradient-to-br from-slate-300/30 to-slate-600/40",
    text: "text-slate-100",
    glow: "shadow-[0_0_10px_-3px_rgba(203,213,225,0.45)]",
    barFill: "bg-slate-300",
  },
  gold: {
    ring: "border-amber-300/90",
    bg: "bg-gradient-to-br from-amber-300/40 to-amber-600/35",
    text: "text-amber-100",
    glow: "shadow-[0_0_12px_-2px_rgba(252,211,77,0.6)]",
    barFill: "bg-amber-300",
  },
};
const TIER_RANK: Record<Tier, number> = { gold: 0, silver: 1, bronze: 2 };

// Kept for backwards compat in the popover positioning code below.
const TIER_RING = {
  bronze: TIER_STYLES.bronze.ring,
  silver: TIER_STYLES.silver.ring,
  gold:   TIER_STYLES.gold.ring,
};
const TIER_TEXT = {
  bronze: TIER_STYLES.bronze.text,
  silver: TIER_STYLES.silver.text,
  gold:   TIER_STYLES.gold.text,
};

/**
 * Wraps any achievement element so it shows a popover with the achievement's
 * title + description on hover (desktop) or tap (mobile). Tap toggles a
 * "pinned" state so the popover stays visible while reading; tapping outside
 * or pressing Escape dismisses. stopPropagation keeps a badge tap from
 * accidentally collapsing/expanding the parent scoreboard row.
 */
function AchievementTooltip({
  a,
  children,
  className = "",
}: {
  a: AchievementStatus;
  children: React.ReactNode;
  className?: string;
}) {
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!pinned) return;
    function onDocPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setPinned(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPinned(false);
    }
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  return (
    <span ref={ref} className={`relative inline-block group ${className}`}>
      <span
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setPinned((p) => !p);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setPinned((p) => !p);
          }
        }}
        aria-label={`${a.info.title} — ${a.info.description}`}
        aria-expanded={pinned}
        className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 rounded-xl inline-block"
      >
        {children}
      </span>
      <span
        role="tooltip"
        aria-hidden={!pinned}
        className={`absolute z-40 bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 px-3 py-2 rounded-xl shadow-2xl pointer-events-none text-left transition-opacity duration-150 ${
          pinned
            ? "opacity-100 visible"
            : "opacity-0 invisible group-hover:opacity-100 group-hover:visible"
        }`}
        style={{
          background: "var(--md-surface-3)",
          border: "1px solid var(--md-outline)",
        }}
      >
        <span className="block text-xs font-semibold text-zinc-100">
          {a.info.title}
        </span>
        <span className="block text-[0.7rem] mt-0.5 text-zinc-300 leading-snug">
          {a.info.description}
        </span>
        {a.earned ? (
          <span className="block text-[0.65rem] mt-1 text-emerald-300/90">
            ✓ Earned
          </span>
        ) : (
          <span className="block text-[0.65rem] mt-1 text-amber-300/80">
            Progress: {a.current} / {a.info.target}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * Inline cluster of earned badges shown next to a player's name.
 * Uses an overlapping "stacked medals" layout — the eye reads it as
 * a single decoration rather than a row of individual icons.
 */
function BadgeStrip({ row }: { row: ScoreboardEntry }) {
  const earned = computeAchievements(row).filter((a) => a.earned);
  if (earned.length === 0) return null;
  // Show up to 4 most-prestigious (gold > silver > bronze).
  const top = [...earned]
    .sort((a, b) => TIER_RANK[a.info.tier] - TIER_RANK[b.info.tier])
    .slice(0, 4);
  const rest = earned.length - top.length;

  return (
    <span className="inline-flex items-center">
      {/* Stacked tier medallions. Each gets a dark outer ring so they
          separate visually from the badge behind them. */}
      <span className="inline-flex items-center -space-x-1.5">
        {top.map((a) => {
          const s = TIER_STYLES[a.info.tier];
          return (
            <AchievementTooltip key={a.info.id} a={a}>
              <span
                className={`relative inline-flex items-center justify-center w-6 h-6 rounded-full border text-[0.7rem] leading-none ${s.ring} ${s.bg} ${s.text} ${s.glow}`}
                style={{ boxShadow: "0 0 0 2px var(--md-surface-2)" }}
              >
                {a.info.icon}
              </span>
            </AchievementTooltip>
          );
        })}
      </span>
      {rest > 0 && (
        <span
          className="ml-2 inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full text-[0.6rem] font-bold bg-zinc-700/80 text-zinc-200 tabular-nums"
          style={{ boxShadow: "0 0 0 2px var(--md-surface-2)" }}
          title={`+${rest} more achievement${rest === 1 ? "" : "s"}`}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

/**
 * Single tile in the expanded achievements grid. Perfect aspect-square
 * regardless of earned/locked state — icon + title centered, with progress
 * info accessed via the tooltip wrapper (hover/tap). Locked tiles get an
 * unobtrusive bottom progress strip (absolutely positioned, doesn't affect
 * layout) so progress is still glanceable.
 */
function AchievementCell({ a }: { a: AchievementStatus }) {
  const pct = Math.min(100, Math.round((a.current / a.info.target) * 100));
  const s = TIER_STYLES[a.info.tier];
  return (
    <AchievementTooltip a={a} className="w-full">
      <div
        className={`relative rounded-2xl border aspect-square flex flex-col items-center justify-center gap-1 text-center w-full p-2 overflow-hidden ${
          a.earned
            ? `${s.ring} ${s.bg} ${s.glow}`
            : "border-zinc-700/60 bg-zinc-800/30"
        }`}
      >
        {/* Fixed-size icon container normalizes the visual weight across
            emoji that have different intrinsic dimensions (🎖 vs 💯 vs 💪). */}
        <span
          className={`h-7 w-7 flex items-center justify-center text-xl leading-none ${
            a.earned ? "" : "grayscale opacity-50"
          }`}
          aria-hidden="true"
        >
          {a.info.icon}
        </span>
        <span
          className={`text-[0.55rem] font-semibold leading-tight line-clamp-2 px-0.5 ${
            a.earned ? s.text : "text-zinc-500"
          }`}
        >
          {a.info.title}
        </span>
        {/* Bottom progress strip — absolute so it never pushes the layout.
            Earned tiles don't need it (background tint signals completion). */}
        {!a.earned && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-700/60">
            <div
              className="h-full bg-indigo-400 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </AchievementTooltip>
  );
}

function DetailRow({
  label,
  value,
  extra,
}: {
  label: string;
  value: string;
  extra?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="font-medium text-zinc-200">{value}</span>
        {extra && <span className="text-amber-300/80 text-[0.7rem]">{extra}</span>}
      </span>
    </div>
  );
}

function RankBadge({ index }: { index: number }) {
  const styles = [
    "bg-amber-400 text-zinc-900",
    "bg-zinc-300 text-zinc-900",
    "bg-amber-700 text-amber-50",
  ];
  return (
    <span
      className={`w-7 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
        styles[index] ?? "bg-zinc-700 text-zinc-200"
      }`}
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
  variant: TableVariant;
}) {
  if (variant === "points") {
    return (
      <span className="text-right shrink-0">
        <div className="font-semibold text-amber-300">{row.points ?? 0} pts</div>
        <div className="text-[0.65rem]" style={{ color: "var(--md-on-surface-variant)" }}>
          {row.wins}W / {row.games}G
        </div>
      </span>
    );
  }
  if (variant === "sequences") {
    return (
      <span className="text-right shrink-0">
        <div className="font-semibold">{row.fivefivesClosed ?? 0}</div>
        <div className="text-[0.65rem]" style={{ color: "var(--md-on-surface-variant)" }}>
          across {row.games} game{row.games === 1 ? "" : "s"}
        </div>
      </span>
    );
  }
  if (variant === "mvp") {
    return (
      <span className="text-right shrink-0">
        <div className="font-semibold">{row.mvpGames ?? 0}</div>
        <div className="text-[0.65rem]" style={{ color: "var(--md-on-surface-variant)" }}>
          {row.games > 0 ? (((row.mvpGames ?? 0) / row.games) * 100).toFixed(0) : 0}% of games
        </div>
      </span>
    );
  }
  return (
    <span className="text-right shrink-0">
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

function Skeletons() {
  return (
    <div className="space-y-4">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-24 rounded-full" style={{ background: "var(--md-surface-2)" }} />
          <div className="h-9 w-full rounded-2xl animate-pulse" style={{ background: "var(--md-surface-2)" }} />
          <div className="h-9 w-full rounded-2xl animate-pulse" style={{ background: "var(--md-surface-2)" }} />
        </div>
      ))}
    </div>
  );
}

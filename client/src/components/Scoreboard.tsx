import { useEffect, useState } from "react";
import type {
  AchievementStatus,
  PaginatedScoreboard,
  ScoreboardEntry,
  ScoreboardResponse,
} from "@sequence/shared";
import { computeAchievements } from "@sequence/shared";

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
  const seq = row.sequencesClosed ?? 0;
  const winSeq = row.winningSequencesClosed ?? 0;
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
          <span className="text-amber-300/80">
            {earnedCount} / {achievements.length}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {achievements.map((a) => (
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

const TIER_RING: Record<"bronze" | "silver" | "gold", string> = {
  bronze: "border-amber-700/70 bg-amber-900/30",
  silver: "border-zinc-300/60 bg-zinc-500/20",
  gold:   "border-amber-300/80 bg-amber-400/20",
};
const TIER_TEXT: Record<"bronze" | "silver" | "gold", string> = {
  bronze: "text-amber-200",
  silver: "text-zinc-100",
  gold:   "text-amber-200",
};

function BadgeStrip({ row }: { row: ScoreboardEntry }) {
  const earned = computeAchievements(row).filter((a) => a.earned);
  if (earned.length === 0) return null;
  // Show up to 4 most-prestigious (gold > silver > bronze).
  const tierRank = { gold: 0, silver: 1, bronze: 2 } as const;
  const top = [...earned]
    .sort((a, b) => tierRank[a.info.tier] - tierRank[b.info.tier])
    .slice(0, 4);
  const rest = earned.length - top.length;
  return (
    <span className="flex items-center gap-1 flex-wrap">
      {top.map((a) => (
        <span
          key={a.info.id}
          title={`${a.info.title} — ${a.info.description}`}
          className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[0.65rem] border ${TIER_RING[a.info.tier]} ${TIER_TEXT[a.info.tier]}`}
        >
          {a.info.icon}
        </span>
      ))}
      {rest > 0 && (
        <span
          className="inline-flex items-center justify-center px-1.5 h-5 rounded-full text-[0.55rem] font-semibold bg-zinc-700/70 text-zinc-200"
          title={`+${rest} more achievement${rest === 1 ? "" : "s"}`}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

function AchievementCell({ a }: { a: AchievementStatus }) {
  const pct = Math.min(100, (a.current / a.info.target) * 100);
  return (
    <div
      title={`${a.info.title} — ${a.info.description}`}
      className={`relative rounded-xl border p-2 flex flex-col items-center gap-1 text-center
        ${a.earned ? TIER_RING[a.info.tier] : "border-zinc-700/60 bg-zinc-800/30 opacity-60"}`}
    >
      <span className={`text-lg ${a.earned ? "" : "grayscale"}`}>{a.info.icon}</span>
      <span className={`text-[0.6rem] font-semibold leading-tight ${a.earned ? TIER_TEXT[a.info.tier] : "text-zinc-400"}`}>
        {a.info.title}
      </span>
      {!a.earned && (
        <div className="w-full mt-0.5">
          <div className="h-1 rounded-full bg-zinc-700 overflow-hidden">
            <div className="h-full bg-indigo-400" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[0.55rem] mt-0.5 text-zinc-500">
            {a.current} / {a.info.target}
          </div>
        </div>
      )}
    </div>
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
        <div className="font-semibold">{row.sequencesClosed ?? 0}</div>
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

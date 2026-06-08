import { useState } from "react";
import type { DeckSummary, PlayerId, RoomView, Team } from "@sequence/shared";
import { Scoreboard } from "../components/Scoreboard";
import { TEAM_CHIP, TEAM_SURFACE, TEAM_TEXT } from "../lib/cards";
import { FilledButton, TonalButton } from "./LandingScreen";

interface Props {
  room: RoomView;
  myPlayerId: PlayerId;
  connected: boolean;
  error: string | null;
  decks: DeckSummary[];
  onClearError: () => void;
  onChooseTeam: (team: Team) => Promise<void>;
  onSetReady: (ready: boolean) => Promise<void>;
  onRenameTeam: (team: Team, name: string) => Promise<void>;
  onAddBot: (team: Team, difficulty: "easy" | "medium") => Promise<void>;
  onRemoveBot: (playerId: PlayerId) => Promise<void>;
  onStart: (opts: { sequencesToWin: number; deckId: string | null }) => Promise<void>;
  onLeave: () => Promise<void>;
}

export function LobbyScreen({
  room,
  myPlayerId,
  connected,
  error,
  decks,
  onClearError,
  onChooseTeam,
  onSetReady,
  onRenameTeam,
  onAddBot,
  onRemoveBot,
  onStart,
  onLeave,
}: Props) {
  const mySeat = room.seats.find((s) => s.id === myPlayerId);
  const isHost = mySeat?.isHost ?? false;
  const [sequencesToWin, setSequencesToWin] = useState(2);
  const [deckId, setDeckId] = useState("");
  const [renamingTeam, setRenamingTeam] = useState<Team | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [botDifficulty, setBotDifficulty] = useState<"easy" | "medium">("medium");

  const allReady = room.seats.length >= 2 && room.seats.every((s) => s.team && s.ready);
  const teamCounts = new Map<Team, number>();
  for (const s of room.seats) {
    if (s.team) teamCounts.set(s.team, (teamCounts.get(s.team) ?? 0) + 1);
  }
  const teamsBalanced =
    teamCounts.size >= 2 &&
    [...teamCounts.values()].every((n) => n === [...teamCounts.values()][0]);
  const canStart = allReady && teamsBalanced;
  const teamsInPlay: Team[] = ["red", "blue"];
  const [scoreboardOpen, setScoreboardOpen] = useState(false);

  function startRename(team: Team) {
    setRenamingTeam(team);
    setRenameDraft(room.teamNames[team]);
  }
  async function commitRename() {
    if (!renamingTeam) return;
    const v = renameDraft.trim();
    if (v.length === 0) {
      setRenamingTeam(null);
      return;
    }
    await onRenameTeam(renamingTeam, v);
    setRenamingTeam(null);
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center p-4 gap-4"
      style={{ background: "var(--md-surface)" }}
    >
      {/* Outer wrapper: responsive max-width — narrow on phones, wide on lg+
          screens so desktop users get a 2-column layout instead of a sliver. */}
      <div className="w-full max-w-md lg:max-w-5xl space-y-4">

      <header className="w-full flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight">Sequence</h1>
        <span
          className="text-xs uppercase tracking-widest"
          style={{ color: connected ? "var(--md-on-surface-variant)" : "var(--md-error)" }}
        >
          {connected ? "Connected" : "Reconnecting…"}
        </span>
      </header>

      {/* Room code card — full width at top, prominent. */}
      <section
        className="w-full rounded-3xl p-5 text-center shadow-sm"
        style={{ background: "var(--md-surface-1)" }}
      >
        <div
          className="text-xs uppercase tracking-widest mb-2"
          style={{ color: "var(--md-on-surface-variant)" }}
        >
          Room code
        </div>
        <div className="text-4xl font-mono font-semibold tracking-[0.3em]">
          {room.code}
        </div>
        <p
          className="text-xs mt-2"
          style={{ color: "var(--md-on-surface-variant)" }}
        >
          Share this code so friends can join
        </p>
      </section>

      {error && (
        <div
          role="alert"
          className="w-full bg-rose-500/15 border border-rose-400/40 text-rose-200 rounded-2xl px-4 py-3 text-sm flex items-start justify-between gap-3"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={onClearError}
            className="text-rose-300 hover:text-rose-100 text-xs font-medium uppercase tracking-wider"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2-col content. Left = player setup (you control this).
          Right = host controls + scoreboards (info / one host action). */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">

      {/* ---------- LEFT COLUMN ---------- */}
      <div className="space-y-4">

      {/* Players list */}
      <section className="w-full">
        <h2 className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--md-on-surface-variant)" }}>
          Players ({room.seats.length})
        </h2>
        <ul className="space-y-1.5">
          {room.seats.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-2xl px-4 py-2.5"
              style={{ background: "var(--md-surface-1)" }}
            >
              <span
                className={`inline-block w-3 h-3 rounded-full border ${
                  s.team ? TEAM_CHIP[s.team] : "bg-zinc-600 border-zinc-500"
                }`}
              />
              <span className="font-medium truncate flex items-center gap-1.5">
                {s.isBot && <span className="text-base leading-none" aria-label="bot">🤖</span>}
                {s.name}
              </span>
              {s.isHost && (
                <span className="text-amber-300 text-[0.65rem] uppercase tracking-wider font-medium">host</span>
              )}
              {s.id === myPlayerId && (
                <span className="text-indigo-300 text-[0.65rem] uppercase tracking-wider font-medium">you</span>
              )}
              <span className="ml-auto flex items-center gap-2 text-xs">
                {!s.connected && !s.isBot && <span className="text-rose-400">offline</span>}
                {s.team && (
                  <span style={{ color: "var(--md-on-surface-variant)" }}>
                    {room.teamNames[s.team]}
                  </span>
                )}
                {s.ready ? (
                  <span className="text-emerald-400 font-medium">ready</span>
                ) : (
                  <span style={{ color: "var(--md-on-surface-variant)" }}>not ready</span>
                )}
                {isHost && s.isBot && (
                  <button
                    type="button"
                    onClick={() => void onRemoveBot(s.id)}
                    className="text-rose-400/80 hover:text-rose-300 text-xs uppercase tracking-wider font-medium px-1.5 py-0.5 rounded border border-rose-500/30 hover:border-rose-400/60"
                    title="Remove bot"
                  >
                    ✕
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Bot picker — host only, pre-game only */}
      {isHost && !room.inGame && (
        <section
          className="w-full rounded-3xl p-4 space-y-3 shadow-sm"
          style={{ background: "var(--md-surface-1)" }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-widest" style={{ color: "var(--md-on-surface-variant)" }}>
              Add a bot
            </h2>
            <div className="inline-flex rounded-full border border-zinc-700 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setBotDifficulty("easy")}
                className={`px-3 py-1 transition-colors ${
                  botDifficulty === "easy"
                    ? "bg-emerald-500/30 text-emerald-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Easy
              </button>
              <button
                type="button"
                onClick={() => setBotDifficulty("medium")}
                className={`px-3 py-1 transition-colors ${
                  botDifficulty === "medium"
                    ? "bg-indigo-500/30 text-indigo-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Medium
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {teamsInPlay.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => void onAddBot(t, botDifficulty)}
                disabled={room.seats.length >= 12}
                className={`state-layer flex items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-medium border-2 ${TEAM_SURFACE[t]} ${TEAM_TEXT[t]} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <span>🤖</span>
                <span>Add to {room.teamNames[t]}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Team picker with rename */}
      <section className="w-full space-y-2">
        <h2 className="text-xs uppercase tracking-widest" style={{ color: "var(--md-on-surface-variant)" }}>
          Choose your team
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {teamsInPlay.map((t) => {
            const selected = mySeat?.team === t;
            const editing = renamingTeam === t;
            return (
              <div
                key={t}
                className={`rounded-2xl border-2 p-3 transition-all ${TEAM_SURFACE[t]} ${
                  selected ? `ring-2 ring-offset-2 ring-offset-zinc-950 ${TEAM_TEXT[t]}` : ""
                }`}
              >
                {editing ? (
                  <div className="flex gap-1">
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commitRename();
                        if (e.key === "Escape") setRenamingTeam(null);
                      }}
                      maxLength={24}
                      className="flex-1 min-w-0 bg-zinc-900/60 rounded-lg px-2 py-1 text-sm border border-zinc-700 focus:outline-none focus:border-indigo-400"
                    />
                    <button
                      type="button"
                      onClick={() => void commitRename()}
                      className="text-xs text-emerald-300 hover:text-emerald-200 px-2"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingTeam(null)}
                      className="text-xs text-zinc-400 hover:text-zinc-200 px-2"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onChooseTeam(t)}
                    className={`w-full text-left font-semibold tracking-tight ${TEAM_TEXT[t]}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-3 h-3 rounded-full border ${TEAM_CHIP[t]}`} />
                      <span className="truncate">{room.teamNames[t]}</span>
                      {isHost && (
                        <span
                          onClick={(e) => { e.stopPropagation(); startRename(t); }}
                          className="ml-auto text-[0.65rem] uppercase tracking-wider font-medium opacity-70 hover:opacity-100 cursor-pointer px-1.5 py-0.5 rounded border border-current"
                        >
                          Edit
                        </span>
                      )}
                    </div>
                    <div className="text-xs opacity-80 mt-1">
                      {(teamCounts.get(t) ?? 0)} player{(teamCounts.get(t) ?? 0) === 1 ? "" : "s"}
                    </div>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Ready toggle */}
      <section className="w-full">
        {mySeat?.ready ? (
          <TonalButton onClick={() => onSetReady(false)}>Ready ✓ — tap to un-ready</TonalButton>
        ) : (
          <FilledButton disabled={!mySeat?.team} onClick={() => onSetReady(true)}>
            Mark ready
          </FilledButton>
        )}
      </section>

      </div>
      {/* ---------- RIGHT COLUMN ---------- */}
      <div className="space-y-4">

      {/* Scoreboard */}
      {(room.gamesPlayed > 0 || room.teamScores.red > 0 || room.teamScores.blue > 0) && (
        <section className="w-full rounded-3xl p-4 space-y-3 shadow-sm" style={{ background: "var(--md-surface-1)" }}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs uppercase tracking-widest" style={{ color: "var(--md-on-surface-variant)" }}>
              Scoreboard
            </h2>
            <span className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>
              {room.gamesPlayed} game{room.gamesPlayed === 1 ? "" : "s"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {teamsInPlay.map((t) => (
              <div key={t} className={`rounded-2xl p-3 border ${TEAM_SURFACE[t]}`}>
                <div className={`text-xs uppercase tracking-wider ${TEAM_TEXT[t]}`}>
                  {room.teamNames[t]}
                </div>
                <div className="text-2xl font-semibold mt-1">{room.teamScores[t]}</div>
              </div>
            ))}
          </div>
          {Object.keys(room.playerScores).length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider mb-1.5" style={{ color: "var(--md-on-surface-variant)" }}>
                By player
              </div>
              <ul className="space-y-1">
                {Object.entries(room.playerScores)
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, wins]) => (
                    <li
                      key={name}
                      className="flex items-center justify-between rounded-xl px-3 py-1.5"
                      style={{ background: "var(--md-surface-2)" }}
                    >
                      <span className="text-sm">{name}</span>
                      <span className="text-sm font-semibold text-amber-300">
                        {wins} win{wins === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Host controls */}
      {isHost && (
        <section className="w-full rounded-3xl p-4 space-y-3 shadow-sm" style={{ background: "var(--md-surface-1)" }}>
          <h2 className="text-xs uppercase tracking-widest" style={{ color: "var(--md-on-surface-variant)" }}>
            Host controls
          </h2>
          <SelectRow label="Sequences to win" value={String(sequencesToWin)} onChange={(v) => setSequencesToWin(Number(v))}>
            <option value="1">1 (quick)</option>
            <option value="2">2 (standard)</option>
            <option value="3">3 (long)</option>
            <option value="4">4 (marathon)</option>
          </SelectRow>
          <SelectRow
            label="Card layout"
            value={deckId}
            onChange={setDeckId}
            testId="deck-select"
          >
            <option value="">Built-in</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </SelectRow>

          <FilledButton
            disabled={!canStart}
            onClick={() => onStart({ sequencesToWin, deckId: deckId || null })}
          >
            Start game
          </FilledButton>
          {!canStart && (
            <p className="text-xs text-center" style={{ color: "var(--md-on-surface-variant)" }}>
              {room.seats.length < 2
                ? "Need at least 2 players."
                : !teamsBalanced
                  ? "Teams must be even."
                  : "Everyone needs to mark ready."}
            </p>
          )}
        </section>
      )}

      {/* Global hall-of-fame leaderboard, same component as the landing
          screen. Shows current top players + teams without leaving the room. */}
      <section
        className="w-full rounded-3xl p-5 space-y-3 shadow-sm"
        style={{ background: "var(--md-surface-1)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-widest" style={{ color: "var(--md-on-surface-variant)" }}>
            Hall of fame
          </h2>
          <button
            type="button"
            onClick={() => setScoreboardOpen(true)}
            className="state-layer text-indigo-300 hover:text-indigo-200 text-xs uppercase tracking-widest font-medium px-3 py-1 rounded-full border border-indigo-400/40"
          >
            View all
          </button>
        </div>
        <Scoreboard />
      </section>

      </div>
      </div>
      {/* ---------- /grid ---------- */}

      {/* Leave button, centered below the grid. */}
      <div className="text-center pt-2 pb-2">
        <button
          type="button"
          onClick={onLeave}
          className="text-zinc-500 hover:text-rose-300 text-xs uppercase tracking-widest font-medium"
        >
          Leave room
        </button>
      </div>

      </div>
      {/* ---------- /outer wrapper ---------- */}

      {scoreboardOpen && (
        <Scoreboard asDialog onClose={() => setScoreboardOpen(false)} />
      )}
    </main>
  );
}

function SelectRow(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span style={{ color: "var(--md-on-surface-variant)" }}>{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        data-testid={props.testId}
        className="bg-zinc-900/60 border rounded-xl px-3 py-1.5 max-w-[60%] focus:outline-none focus:border-indigo-400 transition-colors"
        style={{ borderColor: "var(--md-outline)" }}
      >
        {props.children}
      </select>
    </label>
  );
}

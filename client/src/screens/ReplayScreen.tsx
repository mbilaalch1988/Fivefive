import { useEffect, useMemo, useRef, useState } from "react";
import {
  getOfficialBoard,
  replayBoardAt,
  type DeckManifest,
  type DeckSummary,
  type GameView,
  type ReplayDetail,
  type Team,
} from "@sequence/shared";
import { Board } from "../components/Board";
import { RANK_DISPLAY, SUIT_SYMBOL, TEAM_CHIP, TEAM_TEXT } from "../lib/cards";

interface Props {
  gameId: string;
  onClose: () => void;
}

const ASSET_BASE =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? "http://localhost:3001" : "");

const SPEEDS = [
  { label: "0.5×", ms: 1400 },
  { label: "1×",   ms: 700  },
  { label: "2×",   ms: 350  },
  { label: "4×",   ms: 150  },
];

export function ReplayScreen({ gameId, onClose }: Props) {
  const [replay, setReplay] = useState<ReplayDetail | null>(null);
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [deck, setDeck] = useState<DeckManifest | null>(null);
  const [step, setStep] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch replay + decks list in parallel.
  useEffect(() => {
    let cancelled = false;
    void fetch(`${ASSET_BASE}/api/replays/${gameId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("replay not found"))))
      .then((d: ReplayDetail) => {
        if (!cancelled) setReplay(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    void fetch(`${ASSET_BASE}/api/decks`)
      .then((r) => (r.ok ? r.json() : { decks: [] }))
      .then((d: { decks: DeckSummary[] }) => {
        if (!cancelled) setDecks(d.decks ?? []);
      })
      .catch(() => {
        if (!cancelled) setDecks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  // Once we know both the deck list and the replay's deckId, fetch the
  // full manifest so the board cells get card art.
  useEffect(() => {
    if (!replay || decks === null) return;
    if (!replay.deckId) {
      setDeck(null);
      return;
    }
    let cancelled = false;
    void fetch(`${ASSET_BASE}/api/decks/${replay.deckId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no manifest"))))
      .then((m: DeckManifest) => {
        if (!cancelled) setDeck(m);
      })
      .catch(() => {
        if (!cancelled) setDeck(null);
      });
    return () => {
      cancelled = true;
    };
  }, [replay, decks]);

  const board = useMemo(() => getOfficialBoard(), []);
  const boardState = useMemo(
    () => (replay ? replayBoardAt(board, replay.actions, step) : null),
    [replay, board, step],
  );

  // Auto-play timer.
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || !replay) return;
    if (step >= replay.actions.length) {
      setPlaying(false);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      setStep((s) => Math.min(replay.actions.length, s + 1));
    }, SPEEDS[speedIdx]!.ms);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [playing, step, speedIdx, replay]);

  if (error) {
    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center p-6 gap-4"
        style={{ background: "var(--md-surface)" }}
      >
        <p className="text-rose-300">{error}</p>
        <button
          type="button"
          onClick={onClose}
          className="state-layer px-5 py-2 rounded-full bg-zinc-800 text-zinc-100"
        >
          Back
        </button>
      </main>
    );
  }

  if (!replay || !boardState) {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--md-surface)" }}
      >
        <div
          className="h-10 w-10 rounded-full animate-pulse"
          style={{ background: "var(--md-surface-2)" }}
        />
      </main>
    );
  }

  const currentAction = step > 0 ? replay.actions[step - 1] ?? null : null;
  const totalSteps = replay.actions.length;

  // Synthesize a minimal GameView so we can reuse <Board>.
  const fakeView: GameView = {
    board,
    chips: boardState.chips,
    players: replay.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      handCount: 0,
      connected: true,
      isCurrentTurn: i === step % replay.players.length,
      chipsPlaced: 0,
      chipsRemoved: 0,
      sequencesClosed: 0,
    })),
    myHand: [],
    turnIdx: step % replay.players.length,
    drawPileCount: 0,
    discardPileTop: null,
    sequences: boardState.sequences,
    lockedChips: [...boardState.lockedChips],
    winner: step >= totalSteps ? replay.winningTeam : null,
    discardedThisTurn: false,
    sequencesToWin: replay.sequencesToWin,
    teamSequenceCounts: boardState.teamSequenceCounts,
    deck,
    teamNames: replay.teamNames,
    mvpNames: [],
    recentActions: [],
  };

  return (
    <main
      className="min-h-screen flex flex-col items-center p-2 sm:p-4 gap-3 pt-3 pb-32"
      style={{ background: "var(--md-surface)" }}
    >
      {/* Header */}
      <header className="w-full max-w-3xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="state-layer w-9 h-9 rounded-full bg-zinc-800 text-zinc-100 flex items-center justify-center"
            aria-label="Close"
          >
            ←
          </button>
          <div>
            <div className="text-xs uppercase tracking-widest" style={{ color: "var(--md-on-surface-variant)" }}>
              Replay
            </div>
            <div className="text-lg font-medium tracking-tight">
              Room {replay.roomCode}
              {replay.winningTeam && (
                <span className={`ml-2 text-sm ${TEAM_TEXT[replay.winningTeam]}`}>
                  · {replay.teamNames[replay.winningTeam]} won
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Team chip counts */}
      <div className="w-full max-w-3xl flex items-center justify-center gap-3 text-xs sm:text-sm" style={{ color: "var(--md-on-surface-variant)" }}>
        <span>Need {replay.sequencesToWin}:</span>
        {(["red", "blue", "green"] as Team[]).map((t) => {
          if (!replay.players.some((p) => p.team === t)) return null;
          return (
            <span key={t} className="flex items-center gap-1.5">
              <span className={`inline-block w-3 h-3 rounded-full ${TEAM_CHIP[t]}`} />
              {replay.teamNames[t]}: <span className="font-semibold">{boardState.teamSequenceCounts[t]}</span>
            </span>
          );
        })}
      </div>

      {/* Board */}
      <div className="w-full max-w-3xl">
        <Board
          view={fakeView}
          justLocked={new Set()}
          justPlaced={
            currentAction?.pos && currentAction.type === "place"
              ? new Set([`${currentAction.pos.r},${currentAction.pos.c}`])
              : new Set()
          }
          celebratingTeam={null}
          highlight={() => "none"}
          onSquareClick={() => undefined}
        />
      </div>

      {/* Action description */}
      <div
        className="w-full max-w-3xl rounded-2xl px-4 py-3 text-sm flex items-center gap-3"
        style={{ background: "var(--md-surface-1)" }}
      >
        <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: "var(--md-on-surface-variant)" }}>
          {step}/{totalSteps}
        </span>
        {currentAction ? (
          <span className="flex-1 truncate">
            <span className={`font-semibold ${TEAM_TEXT[currentAction.team]}`}>
              {currentAction.playerName}
            </span>{" "}
            <span style={{ color: "var(--md-on-surface-variant)" }}>
              {actionVerb(currentAction.type)}{" "}
            </span>
            <span className="font-medium">
              {RANK_DISPLAY[currentAction.rank]}
              {SUIT_SYMBOL[currentAction.suit]}
            </span>
            {currentAction.pos && (
              <span style={{ color: "var(--md-on-surface-variant)" }}>
                {" "}at ({currentAction.pos.r + 1}, {currentAction.pos.c + 1})
              </span>
            )}
          </span>
        ) : (
          <span className="flex-1" style={{ color: "var(--md-on-surface-variant)" }}>
            Press play to begin replay.
          </span>
        )}
      </div>

      {/* Scrub bar */}
      <div className="w-full max-w-3xl">
        <input
          type="range"
          min={0}
          max={totalSteps}
          value={step}
          onChange={(e) => {
            setPlaying(false);
            setStep(Number(e.target.value));
          }}
          className="w-full accent-indigo-400"
        />
      </div>

      {/* Controls — fixed at the bottom for thumb access */}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-zinc-900/95 backdrop-blur rounded-full px-3 py-2 border border-zinc-700 shadow-lg shadow-black/40"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
      >
        <CtrlButton onClick={() => { setPlaying(false); setStep(0); }} label="⏮" title="Restart" />
        <CtrlButton onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }} label="⏪" title="Step back" />
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="state-layer w-12 h-12 rounded-full bg-indigo-500 hover:bg-indigo-400 text-white text-xl font-bold flex items-center justify-center"
          title={playing ? "Pause" : "Play"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <CtrlButton onClick={() => { setPlaying(false); setStep((s) => Math.min(totalSteps, s + 1)); }} label="⏩" title="Step forward" />
        <CtrlButton onClick={() => { setPlaying(false); setStep(totalSteps); }} label="⏭" title="To end" />
        <button
          type="button"
          onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
          className="state-layer ml-1 px-3 h-9 rounded-full bg-zinc-800 text-zinc-100 text-xs font-semibold"
          title="Playback speed"
        >
          {SPEEDS[speedIdx]!.label}
        </button>
      </div>
    </main>
  );
}

function CtrlButton({
  onClick,
  label,
  title,
}: {
  onClick: () => void;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="state-layer w-9 h-9 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm flex items-center justify-center"
    >
      {label}
    </button>
  );
}

function actionVerb(t: "place" | "remove" | "discardDead"): string {
  switch (t) {
    case "place":       return "placed";
    case "remove":      return "removed using";
    case "discardDead": return "discarded dead";
  }
}

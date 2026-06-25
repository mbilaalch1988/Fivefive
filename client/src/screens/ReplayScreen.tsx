import { useEffect, useMemo, useRef, useState } from "react";
import {
  getOfficialBoard,
  replayBoardAt,
  type DeckManifest,
  type DeckSummary,
  type GameView,
  type ReplayDetail,
  type Team,
} from "@fivefive/shared";
import { Board } from "../components/Board";
import { RANK_DISPLAY, SUIT_SYMBOL, TEAM_CHIP, TEAM_TEXT } from "../lib/cards";

interface Props {
  gameId: string;
  onClose: () => void;
}

const ASSET_BASE =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? "http://localhost:3001" : "");

/**
 * Per-step delay when auto-playing. The earlier values were too brisk to
 * read what just happened — these give the eye time to track each move.
 * Default index = 1 (1×).
 */
const SPEEDS = [
  { label: "0.5×", ms: 2500 },
  { label: "1×",   ms: 1500 },
  { label: "2×",   ms: 800  },
  { label: "4×",   ms: 400  },
];

export function ReplayScreen({ gameId, onClose }: Props) {
  const [replay, setReplay] = useState<ReplayDetail | null>(null);
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [deck, setDeck] = useState<DeckManifest | null>(null);
  const [step, setStep] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock background page scroll while the overlay is open — prevents the
  // viewport's scrollbar from appearing/disappearing under us as content
  // changes, which would otherwise nudge the board width per step.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Escape closes the overlay.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  // Synthesize a minimal GameView so we can reuse <Board>. Memoized so the
  // Board doesn't re-mount and re-flip cells on every parent render — that
  // was contributing to the perceived "size fluctuation".
  const fakeView = useMemo<GameView | null>(() => {
    if (!replay || !boardState) return null;
    return {
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
        fivefivesClosed: 0,
      })),
      myHand: [],
      turnIdx: step % replay.players.length,
      drawPileCount: 0,
      discardPileTop: null,
      fivefives: boardState.fivefives,
      lockedChips: [...boardState.lockedChips],
      winner: step >= replay.actions.length ? replay.winningTeam : null,
      discardedThisTurn: false,
      fivefivesToWin: replay.fivefivesToWin,
      teamFivefiveCounts: boardState.teamFivefiveCounts,
      deck,
      teamNames: replay.teamNames,
      mvpNames: [],
      recentActions: [],
      turnTimerSec: null,
      turnExpiresAt: null,
    };
  }, [replay, boardState, board, deck, step]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto overlay-enter"
      style={{ background: "var(--md-surface)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Game replay"
      data-testid="replay-overlay"
    >
      {error ? (
        <div className="min-h-full flex flex-col items-center justify-center p-6 gap-4">
          <p className="text-rose-300">{error}</p>
          <button
            type="button"
            onClick={onClose}
            className="state-layer px-5 py-2 rounded-full bg-zinc-800 text-zinc-100"
          >
            Close
          </button>
        </div>
      ) : !replay || !boardState || !fakeView ? (
        <div className="min-h-full flex items-center justify-center">
          <div
            className="h-10 w-10 rounded-full animate-pulse"
            style={{ background: "var(--md-surface-2)" }}
          />
        </div>
      ) : (
        <ReplayContent
          replay={replay}
          fakeView={fakeView}
          boardState={boardState}
          step={step}
          setStep={setStep}
          playing={playing}
          setPlaying={setPlaying}
          speedIdx={speedIdx}
          setSpeedIdx={setSpeedIdx}
          onClose={onClose}
        />
      )}
    </div>
  );
}

interface ContentProps {
  replay: ReplayDetail;
  fakeView: GameView;
  boardState: {
    chips: GameView["chips"];
    fivefives: GameView["fivefives"];
    lockedChips: Set<string>;
    teamFivefiveCounts: GameView["teamFivefiveCounts"];
  };
  step: number;
  setStep: (s: number | ((s: number) => number)) => void;
  playing: boolean;
  setPlaying: (p: boolean | ((p: boolean) => boolean)) => void;
  speedIdx: number;
  setSpeedIdx: (i: number | ((i: number) => number)) => void;
  onClose: () => void;
}

function ReplayContent({
  replay,
  fakeView,
  boardState,
  step,
  setStep,
  playing,
  setPlaying,
  speedIdx,
  setSpeedIdx,
  onClose,
}: ContentProps) {
  const totalSteps = replay.actions.length;
  const currentAction = step > 0 ? replay.actions[step - 1] ?? null : null;
  const justPlaced = useMemo(
    () =>
      currentAction?.pos && currentAction.type === "place"
        ? new Set([`${currentAction.pos.r},${currentAction.pos.c}`])
        : new Set<string>(),
    [currentAction],
  );

  return (
    <div className="min-h-full flex flex-col items-center px-3 sm:px-4 pb-40">
      {/* Sticky header — always visible while scrolling the replay content. */}
      <header
        className="sticky top-0 z-10 w-full max-w-3xl flex items-center justify-between py-3 backdrop-blur"
        style={{ background: "rgba(19, 19, 22, 0.92)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-400/40 flex items-center justify-center shrink-0">
            <span className="text-amber-200">▶</span>
          </div>
          <div className="min-w-0">
            <div
              className="text-[0.65rem] sm:text-xs uppercase tracking-widest"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              Replay
            </div>
            <div className="text-sm sm:text-base font-medium tracking-tight truncate">
              Room {replay.roomCode}
              {replay.winningTeam && (
                <span className={`ml-2 text-xs sm:text-sm ${TEAM_TEXT[replay.winningTeam]}`}>
                  · {replay.teamNames[replay.winningTeam]} won
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close replay"
          data-testid="replay-close"
          className="state-layer w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 flex items-center justify-center text-xl shrink-0"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </header>

      {/* Team chip counts — fixed min-height so it never reflows the board. */}
      <div
        className="w-full max-w-3xl flex items-center justify-center gap-3 text-xs sm:text-sm mt-2 min-h-[1.75rem]"
        style={{ color: "var(--md-on-surface-variant)" }}
      >
        <span className="shrink-0">Need {replay.fivefivesToWin}:</span>
        {(["red", "blue", "green"] as Team[]).map((t) => {
          if (!replay.players.some((p) => p.team === t)) return null;
          return (
            <span key={t} className="flex items-center gap-1.5 shrink-0">
              <span className={`inline-block w-3 h-3 rounded-full ${TEAM_CHIP[t]}`} />
              <span className="truncate max-w-[8rem]">{replay.teamNames[t]}</span>:{" "}
              <span className="font-semibold text-zinc-100">
                {boardState.teamFivefiveCounts[t]}
              </span>
            </span>
          );
        })}
      </div>

      {/* Board — fixed-width container, aspect-ratio cells keep height stable. */}
      <div className="w-full max-w-3xl mt-3">
        <Board
          view={fakeView}
          justLocked={new Set()}
          justPlaced={justPlaced}
          celebratingTeam={null}
          highlight={() => "none"}
          onSquareClick={() => undefined}
        />
      </div>

      {/* Action description — min-h prevents the row collapsing between steps. */}
      <div
        className="w-full max-w-3xl rounded-2xl px-4 py-3 text-sm flex items-center gap-3 mt-3 min-h-[3.25rem]"
        style={{ background: "var(--md-surface-1)" }}
      >
        <span
          className="text-xs uppercase tracking-widest font-semibold shrink-0 tabular-nums"
          style={{ color: "var(--md-on-surface-variant)" }}
        >
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
                {" "}
                at ({currentAction.pos.r + 1}, {currentAction.pos.c + 1})
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
      <div className="w-full max-w-3xl mt-3">
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
          aria-label="Scrub through replay"
        />
      </div>

      {/* Controls — fixed at the bottom for thumb access */}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-zinc-900/95 backdrop-blur rounded-full px-3 py-2 border border-zinc-700 shadow-lg shadow-black/40"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
      >
        <CtrlButton
          onClick={() => {
            setPlaying(false);
            setStep(0);
          }}
          label="⏮"
          title="Restart"
        />
        <CtrlButton
          onClick={() => {
            setPlaying(false);
            setStep((s) => Math.max(0, s - 1));
          }}
          label="⏪"
          title="Step back"
        />
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="state-layer w-12 h-12 rounded-full bg-indigo-500 hover:bg-indigo-400 text-white text-xl font-bold flex items-center justify-center"
          title={playing ? "Pause" : "Play"}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <CtrlButton
          onClick={() => {
            setPlaying(false);
            setStep((s) => Math.min(totalSteps, s + 1));
          }}
          label="⏩"
          title="Step forward"
        />
        <CtrlButton
          onClick={() => {
            setPlaying(false);
            setStep(totalSteps);
          }}
          label="⏭"
          title="To end"
        />
        <button
          type="button"
          onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
          className="state-layer ml-1 px-3 h-9 rounded-full bg-zinc-800 text-zinc-100 text-xs font-semibold tabular-nums"
          title="Playback speed"
        >
          {SPEEDS[speedIdx]!.label}
        </button>
      </div>
    </div>
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
      aria-label={title}
      className="state-layer w-9 h-9 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm flex items-center justify-center"
    >
      {label}
    </button>
  );
}

function actionVerb(t: "place" | "remove" | "discardDead"): string {
  switch (t) {
    case "place":
      return "placed";
    case "remove":
      return "removed using";
    case "discardDead":
      return "discarded dead";
  }
}

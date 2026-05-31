import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import {
  buildCardIndex,
  cardKey,
  isOneEyedJack,
  isTwoEyedJack,
  type Action,
  type GameView,
  type PlayerId,
  type Pos,
  type RoomView,
  type Team,
} from "@sequence/shared";
import { Board } from "../components/Board";
import { CardFace } from "../components/CardFace";
import { Hand } from "../components/Hand";
import { LastPlayedHistory } from "../components/LastPlayedHistory";
import { SequenceAnnounce } from "../components/SequenceAnnounce";
import { StickerOverlay } from "../components/StickerOverlay";
import { StickerPicker } from "../components/StickerPicker";
import { TurnBar } from "../components/TurnBar";
import { WinOverlay } from "../components/WinOverlay";
import type { StickerBroadcast } from "@sequence/shared";

/** Team chip colors for confetti palette. */
const TEAM_CONFETTI: Record<Team, string[]> = {
  red: ["#f43f5e", "#fb7185", "#fda4af", "#fbbf24"],
  blue: ["#0ea5e9", "#38bdf8", "#bae6fd", "#fbbf24"],
  green: ["#10b981", "#34d399", "#a7f3d0", "#fbbf24"],
};

export type Dispatch = (action: Action) => Promise<{ ok: boolean; error?: string }>;

interface Props {
  view: GameView;
  room: RoomView | null;
  myPlayerId: PlayerId | null;
  isHost: boolean;
  stickers: StickerBroadcast[];
  dispatch: Dispatch;
  onSendSticker: (stickerId: string) => Promise<void>;
  onStopGame: () => Promise<void>;
  onRematch: () => Promise<void>;
}

type WinStage = "playing" | "celebrating" | "overlay";

export function GameScreen({
  view,
  room,
  myPlayerId,
  isHost,
  stickers,
  dispatch,
  onSendSticker,
  onStopGame,
  onRematch,
}: Props) {
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const me = view.players.find((p) => p.id === myPlayerId) ?? null;
  const myTurn = !!me && me.isCurrentTurn;
  const selectedCard = view.myHand.find((c) => c.id === selectedCardId) ?? null;

  const cardIndex = useMemo(() => buildCardIndex(view.board), [view.board]);

  const deadCardIds = useMemo(() => {
    const dead = new Set<number>();
    for (const card of view.myHand) {
      if (card.rank === "J") continue;
      const positions = cardIndex.get(cardKey(card.rank, card.suit)) ?? [];
      if (positions.every((p) => view.chips[p.r]![p.c] !== null)) {
        dead.add(card.id);
      }
    }
    return dead;
  }, [view.myHand, view.chips, cardIndex]);

  const lockedSet = useMemo(() => new Set(view.lockedChips), [view.lockedChips]);

  const prevLockedRef = useRef<Set<string>>(new Set());
  const [justLocked, setJustLocked] = useState<ReadonlySet<string>>(new Set());
  const [announceTeam, setAnnounceTeam] = useState<Team | null>(null);
  useEffect(() => {
    const current = new Set(view.lockedChips);
    const newly = new Set<string>();
    for (const key of current) {
      if (!prevLockedRef.current.has(key)) newly.add(key);
    }
    prevLockedRef.current = current;
    if (newly.size > 0) {
      setJustLocked(newly);
      // Fire confetti from each newly-locked chip (skip if no chip placed
      // at that pos, which can happen for corner-wild positions).
      requestAnimationFrame(() => {
        for (const key of newly) {
          const [r, c] = key.split(",").map(Number);
          const el = document.querySelector(`[data-testid="sq-${r}-${c}"]`);
          if (!el) continue;
          const rect = (el as HTMLElement).getBoundingClientRect();
          const team = view.chips[r!]![c!];
          if (!team) continue;
          confetti({
            particleCount: 28,
            spread: 70,
            startVelocity: 35,
            origin: {
              x: (rect.left + rect.width / 2) / window.innerWidth,
              y: (rect.top + rect.height / 2) / window.innerHeight,
            },
            colors: TEAM_CONFETTI[team],
            disableForReducedMotion: true,
          });
        }
      });
      // Show the SEQUENCE! wordmark using the most recent sequence's team.
      const latest = view.sequences[view.sequences.length - 1];
      if (latest) setAnnounceTeam(latest.team);
      const tLock = setTimeout(() => setJustLocked(new Set()), 1200);
      const tAnn = setTimeout(() => setAnnounceTeam(null), 2000);
      return () => {
        clearTimeout(tLock);
        clearTimeout(tAnn);
      };
    }
  }, [view.lockedChips, view.chips, view.sequences]);

  // Track newly-placed chips for the drop-in bounce animation.
  const prevChipsRef = useRef<string>(""); // serialized snapshot
  const [justPlaced, setJustPlaced] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const newly = new Set<string>();
    const sig: string[] = [];
    for (let r = 0; r < view.chips.length; r++) {
      const row = view.chips[r]!;
      for (let c = 0; c < row.length; c++) {
        const chip = row[c];
        if (chip) {
          const key = `${r},${c}`;
          sig.push(`${key}:${chip}`);
          if (!prevChipsRef.current.includes(`${key}:`)) {
            newly.add(key);
          }
        }
      }
    }
    prevChipsRef.current = sig.join("|");
    if (newly.size > 0) {
      setJustPlaced(newly);
      const t = setTimeout(() => setJustPlaced(new Set()), 700);
      return () => clearTimeout(t);
    }
  }, [view.chips]);

  const [winStage, setWinStage] = useState<WinStage>("playing");
  const [celebratingTeam, setCelebratingTeam] = useState<Team | null>(null);
  useEffect(() => {
    if (!view.winner) {
      setWinStage("playing");
      setCelebratingTeam(null);
      return;
    }
    setWinStage("playing");
    const t1 = setTimeout(() => {
      setCelebratingTeam(view.winner!);
      setWinStage("celebrating");
    }, 1400);
    const t2 = setTimeout(() => setWinStage("overlay"), 1400 + 2200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [view.winner]);

  function highlight(pos: Pos): "none" | "playable" | "removable" {
    if (!myTurn || !selectedCard || view.winner) return "none";
    const sq = view.board[pos.r]![pos.c]!;
    if (sq.kind === "corner") return "none";
    const chip = view.chips[pos.r]![pos.c];

    if (isTwoEyedJack(selectedCard)) {
      return chip === null ? "playable" : "none";
    }
    if (isOneEyedJack(selectedCard)) {
      if (chip === null || chip === me?.team) return "none";
      if (lockedSet.has(`${pos.r},${pos.c}`)) return "none";
      return "removable";
    }
    if (chip !== null) return "none";
    return sq.rank === selectedCard.rank && sq.suit === selectedCard.suit
      ? "playable"
      : "none";
  }

  async function onSquareClick(pos: Pos) {
    if (!myTurn || !selectedCard || view.winner) return;
    const h = highlight(pos);
    if (h === "none") return;

    const action: Action =
      h === "removable"
        ? { type: "remove", cardId: selectedCard.id, pos }
        : { type: "place", cardId: selectedCard.id, pos };

    const res = await dispatch(action);
    if (res.ok) {
      setSelectedCardId(null);
      setError(null);
    } else {
      setError(res.error ?? "action failed");
    }
  }

  async function onDiscardDead() {
    if (!selectedCard || !deadCardIds.has(selectedCard.id)) return;
    const res = await dispatch({ type: "discardDead", cardId: selectedCard.id });
    if (res.ok) {
      setSelectedCardId(null);
      setError(null);
    } else {
      setError(res.error ?? "discard failed");
    }
  }

  async function onConfirmStop() {
    await onStopGame();
    setConfirmingStop(false);
  }

  const showDiscardButton =
    myTurn &&
    selectedCard !== null &&
    deadCardIds.has(selectedCard.id) &&
    !view.discardedThisTurn;

  const winnerTeamName = view.winner ? view.teamNames[view.winner] : null;

  return (
    <>
      {/* Fixed top: TurnBar — always visible while the board scrolls. */}
      <header
        className="fixed top-0 left-0 right-0 z-30 shadow-lg backdrop-blur-md"
        style={{ background: "rgba(19, 19, 22, 0.92)" }}
      >
        <div className="max-w-3xl mx-auto px-2 sm:px-4 py-2 sm:py-3">
          <TurnBar view={view} myPlayerId={myPlayerId} />
        </div>
      </header>

      {/* Main scrollable content. Top padding clears the fixed TurnBar, bottom
          padding clears the fixed Last-Played card + Stop button. */}
      <div
        className="min-h-screen flex flex-col items-center p-2 sm:p-4 gap-2.5 sm:gap-3 pt-36 sm:pt-40 pb-36 sm:pb-40"
        style={{ background: "var(--md-surface)" }}
      >
        {error && (
          <div className="bg-rose-500/15 border border-rose-400/40 text-rose-200 px-3 py-1.5 rounded-2xl text-sm">
            {error}
          </div>
        )}

        <div className="w-full max-w-3xl">
          <Board
            view={view}
            justLocked={justLocked}
            justPlaced={justPlaced}
            celebratingTeam={celebratingTeam}
            highlight={highlight}
            onSquareClick={onSquareClick}
          />
        </div>

        <div className="w-full max-w-3xl space-y-2">
          {me ? (
            <>
              <div className="flex items-center justify-between text-sm" style={{ color: "var(--md-on-surface-variant)" }}>
                <span>
                  Your hand ({view.myHand.length}) —{" "}
                  <span className="font-medium text-zinc-100">{me.name}</span>{" "}
                  <span className="opacity-80">({view.teamNames[me.team]})</span>
                </span>
                {showDiscardButton && (
                  <button
                    type="button"
                    onClick={onDiscardDead}
                    className="bg-amber-400 hover:bg-amber-300 text-zinc-900 font-semibold px-3 py-1 rounded-full text-xs uppercase tracking-wider"
                  >
                    Discard dead card
                  </button>
                )}
              </div>
              <Hand
                hand={view.myHand}
                selectedCardId={selectedCardId}
                deadCardIds={deadCardIds}
                disabled={!myTurn || view.winner !== null}
                deck={view.deck}
                onSelect={(id) =>
                  setSelectedCardId((prev) => (prev === id ? null : id))
                }
              />
              {!myTurn && !view.winner && (
                <p className="text-center text-sm" style={{ color: "var(--md-on-surface-variant)" }}>
                  Waiting for {view.players[view.turnIdx]?.name ?? "next player"}…
                </p>
              )}
            </>
          ) : (
            <p className="text-center text-sm" style={{ color: "var(--md-on-surface-variant)" }}>
              Spectating.
            </p>
          )}
        </div>
      </div>

      {/* Last played card — fixed bottom-right. Click to open history. */}
      {view.discardPileTop && !view.winner && (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="fixed right-2 sm:right-4 z-20 flex flex-col items-end hover:brightness-110 transition"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 70px)" }}
          data-testid="last-played"
          title="See last 5 played"
        >
          <span
            className="text-[0.6rem] sm:text-xs mb-1 uppercase tracking-widest"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Last played
          </span>
          <CardFace card={view.discardPileTop} size="responsive" deck={view.deck} />
        </button>
      )}

      {historyOpen && (
        <LastPlayedHistory
          actions={view.recentActions}
          deck={view.deck}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {/* Stop game (host only) — fixed bottom-center, above any address bar */}
      {isHost && !view.winner && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-50"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          {confirmingStop ? (
            <div className="flex items-center gap-2 bg-zinc-900/95 backdrop-blur rounded-full pl-4 pr-2 py-1.5 border border-zinc-700 shadow-lg">
              <span className="text-sm">Stop game?</span>
              <button
                type="button"
                onClick={onConfirmStop}
                className="bg-rose-500 hover:bg-rose-400 text-white px-3 py-1 rounded-full text-sm font-semibold"
                data-testid="stop-confirm"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmingStop(false)}
                className="bg-zinc-700 hover:bg-zinc-600 text-zinc-100 px-3 py-1 rounded-full text-sm"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingStop(true)}
              className="state-layer bg-rose-500/90 hover:bg-rose-500 text-white px-5 py-2.5 rounded-full text-sm font-semibold shadow-lg shadow-rose-900/40 backdrop-blur"
              data-testid="stop-game"
            >
              Stop game
            </button>
          )}
        </div>
      )}

      {view.winner && winStage === "overlay" && (
        <WinOverlay
          team={view.winner}
          teamName={winnerTeamName ?? "Winner"}
          mvpNames={view.mvpNames}
          room={room}
          onRematch={onRematch}
          onLeave={onStopGame}
        />
      )}

      {announceTeam && (
        <SequenceAnnounce
          team={announceTeam}
          teamName={view.teamNames[announceTeam]}
        />
      )}

      {!view.winner && <StickerPicker onSend={onSendSticker} />}
      <StickerOverlay stickers={stickers} />
    </>
  );
}

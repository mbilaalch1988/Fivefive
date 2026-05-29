import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildCardIndex,
  cardKey,
  isOneEyedJack,
  isTwoEyedJack,
  type Action,
  type Card,
  type GameView,
  type PlayerId,
  type Pos,
} from "@sequence/shared";
import { Board } from "../components/Board";
import { CardFace } from "../components/CardFace";
import { Hand } from "../components/Hand";
import { TurnBar } from "../components/TurnBar";
import { WinOverlay } from "../components/WinOverlay";

export type Dispatch = (action: Action) => Promise<{ ok: boolean; error?: string }>;

interface Props {
  view: GameView;
  myPlayerId: PlayerId | null;
  isHost: boolean;
  dispatch: Dispatch;
  onStopGame: () => Promise<void>;
  onPlayAgain?: () => void;
}

export function GameScreen({
  view,
  myPlayerId,
  isHost,
  dispatch,
  onStopGame,
  onPlayAgain,
}: Props) {
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingStop, setConfirmingStop] = useState(false);

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

  // Detect newly-locked chips so we can fire the chip flip animation.
  const prevLockedRef = useRef<Set<string>>(new Set());
  const [justLocked, setJustLocked] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const current = new Set(view.lockedChips);
    const newly = new Set<string>();
    for (const key of current) {
      if (!prevLockedRef.current.has(key)) newly.add(key);
    }
    prevLockedRef.current = current;
    if (newly.size > 0) {
      setJustLocked(newly);
      const t = setTimeout(() => setJustLocked(new Set()), 1200);
      return () => clearTimeout(t);
    }
  }, [view.lockedChips]);

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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center p-2 sm:p-4 gap-2 sm:gap-3 pb-28 sm:pb-32">
      <h1 className="text-xl sm:text-2xl font-bold tracking-wide">Sequence</h1>
      <div className="w-full max-w-3xl">
        <TurnBar view={view} myPlayerId={myPlayerId} />
      </div>

      {error && (
        <div className="bg-rose-700/80 px-3 py-1 rounded text-sm">{error}</div>
      )}

      <div className="w-full max-w-3xl">
        <Board
          view={view}
          justLocked={justLocked}
          highlight={highlight}
          onSquareClick={onSquareClick}
        />
      </div>

      <div className="w-full max-w-3xl space-y-2">
        {me ? (
          <>
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span>
                Your hand ({view.myHand.length}) —{" "}
                <span className="font-semibold">{me.name}</span>{" "}
                <span className="opacity-70">({me.team})</span>
              </span>
              {showDiscardButton && (
                <button
                  type="button"
                  onClick={onDiscardDead}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold px-3 py-1 rounded text-sm"
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
              <p className="text-center text-slate-400 text-sm">
                Waiting for {view.players[view.turnIdx]?.name ?? "next player"}…
              </p>
            )}
          </>
        ) : (
          <p className="text-center text-slate-400 text-sm">Spectating.</p>
        )}
      </div>

      {/* Last-played card, floating bottom-right */}
      {view.discardPileTop && (
        <div
          className="fixed bottom-16 right-2 sm:bottom-20 sm:right-4 z-20 flex flex-col items-end"
          data-testid="last-played"
        >
          <span className="text-[0.6rem] sm:text-xs text-slate-400 mb-1 uppercase tracking-widest">
            Last played
          </span>
          <CardFace card={view.discardPileTop} size="sm" deck={view.deck} />
        </div>
      )}

      {/* Stop game (host only), pinned to very bottom */}
      {isHost && !view.winner && (
        <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-30">
          {confirmingStop ? (
            <div className="flex gap-2 bg-slate-800/95 backdrop-blur rounded-full pl-4 pr-2 py-1.5 border border-slate-700 shadow-lg">
              <span className="text-sm self-center">Stop game?</span>
              <button
                type="button"
                onClick={onConfirmStop}
                className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded-full text-sm font-semibold"
                data-testid="stop-confirm"
              >
                Yes, stop
              </button>
              <button
                type="button"
                onClick={() => setConfirmingStop(false)}
                className="bg-slate-700 hover:bg-slate-600 text-slate-100 px-3 py-1 rounded-full text-sm"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingStop(true)}
              className="bg-rose-600/80 hover:bg-rose-600 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg border border-rose-500"
              data-testid="stop-game"
            >
              Stop game
            </button>
          )}
        </div>
      )}

      {view.winner && <WinOverlay team={view.winner} onPlayAgain={onPlayAgain} />}
    </div>
  );
}

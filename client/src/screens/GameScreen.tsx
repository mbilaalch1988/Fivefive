import { useMemo, useState } from "react";
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
import { Hand } from "../components/Hand";
import { TurnBar } from "../components/TurnBar";
import { WinOverlay } from "../components/WinOverlay";

export type Dispatch = (action: Action) => Promise<{ ok: boolean; error?: string }>;

interface Props {
  view: GameView;
  myPlayerId: PlayerId | null;
  dispatch: Dispatch;
  onPlayAgain?: () => void;
}

export function GameScreen({ view, myPlayerId, dispatch, onPlayAgain }: Props) {
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    // Regular card: must match the square AND square must be empty.
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

  const showDiscardButton =
    myTurn &&
    selectedCard !== null &&
    deadCardIds.has(selectedCard.id) &&
    !view.discardedThisTurn;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center p-2 sm:p-4 gap-2 sm:gap-3">
      <h1 className="text-xl sm:text-2xl font-bold tracking-wide">Sequence</h1>
      <div className="w-full max-w-3xl">
        <TurnBar view={view} myPlayerId={myPlayerId} />
      </div>

      {error && (
        <div className="bg-rose-700/80 px-3 py-1 rounded text-sm">{error}</div>
      )}

      <div className="w-full max-w-3xl">
        <Board view={view} highlight={highlight} onSquareClick={onSquareClick} />
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
              onSelect={(id) =>
                setSelectedCardId((prev) => (prev === id ? null : id))
              }
            />
            {!myTurn && (
              <p className="text-center text-slate-400 text-sm">
                Waiting for {view.players[view.turnIdx]?.name ?? "next player"}…
              </p>
            )}
          </>
        ) : (
          <p className="text-center text-slate-400 text-sm">Spectating.</p>
        )}
      </div>

      {view.winner && <WinOverlay team={view.winner} onPlayAgain={onPlayAgain} />}
    </div>
  );
}

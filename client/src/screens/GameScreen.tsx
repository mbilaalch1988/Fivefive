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
} from "@fivefive/shared";
import { Board } from "../components/Board";
import { Hand } from "../components/Hand";
import { GameMenu } from "../components/GameMenu";
import { JackEffect } from "../components/JackEffect";
import { LastPlayedHistory } from "../components/LastPlayedHistory";
import { PreGameCountdown } from "../components/PreGameCountdown";
import { QuickChatOverlay } from "../components/QuickChatOverlay";
import { QuickChatPicker } from "../components/QuickChatPicker";
import { RulesSheet } from "../components/RulesSheet";
import { FivefiveAnnounce } from "../components/FivefiveAnnounce";
import { StickerOverlay } from "../components/StickerOverlay";
import { StickerPicker } from "../components/StickerPicker";
import { TurnBar } from "../components/TurnBar";
import { WinOverlay } from "../components/WinOverlay";
import { WinFivefiveWalk } from "../components/WinFivefiveWalk";
import type { ActionLog, QuickChatBroadcast, StickerBroadcast } from "@fivefive/shared";
import {
  notifyMyTurn,
  playChipDrop,
  playOneEyedJack,
  playFivefiveDing,
  playTwoEyedJack,
  playWinFlourish,
} from "../lib/notify";

interface JackEffectInstance {
  id: string;
  rect: { left: number; top: number; width: number; height: number };
  variant: "place" | "remove";
}

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
  quickChats: QuickChatBroadcast[];
  dispatch: Dispatch;
  onSendSticker: (stickerId: string) => Promise<void>;
  onSendQuickChat: (chatId: string) => Promise<void>;
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
  quickChats,
  dispatch,
  onSendSticker,
  onSendQuickChat,
  onStopGame,
  onRematch,
}: Props) {
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [quickChatOpen, setQuickChatOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [jackEffects, setJackEffects] = useState<JackEffectInstance[]>([]);
  // Show 3-2-1-GO once per game, only when we land in at action-count 0
  // (fresh start, not a mid-game rejoin).
  const [showIntro, setShowIntro] = useState<boolean>(
    () => view.recentActions.length === 0 && !view.winner,
  );

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
      // Triple-bell ding to mark every fivefive completion (not just wins).
      playFivefiveDing();
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
      // Show the FIVEFIVE! wordmark using the most recent fivefive's team.
      const latest = view.fivefives[view.fivefives.length - 1];
      if (latest) setAnnounceTeam(latest.team);
      const tLock = setTimeout(() => setJustLocked(new Set()), 1200);
      const tAnn = setTimeout(() => setAnnounceTeam(null), 2000);
      return () => {
        clearTimeout(tLock);
        clearTimeout(tAnn);
      };
    }
  }, [view.lockedChips, view.chips, view.fivefives]);

  // Notify (vibrate + chime) when the turn flips TO this player. Skip the
  // very first observation so we don't fire when the user lands in-game.
  const prevTurnPlayerRef = useRef<PlayerId | null>(null);
  useEffect(() => {
    const currentPlayerId = view.players[view.turnIdx]?.id ?? null;
    const wasMe = prevTurnPlayerRef.current === myPlayerId;
    const isMe = currentPlayerId === myPlayerId;
    const isFirstObservation = prevTurnPlayerRef.current === null;
    if (isMe && !wasMe && !isFirstObservation && !view.winner) {
      notifyMyTurn();
    }
    prevTurnPlayerRef.current = currentPlayerId;
  }, [view.turnIdx, view.players, myPlayerId, view.winner]);

  // Watch recentActions for newly-arrived Jack plays. For each one, locate the
  // target cell in the DOM and spawn a JackEffect over it. Independent of
  // fivefive completion — confetti still fires on locks, this just announces
  // which square a special card hit.
  const prevActionCountRef = useRef<number>(0);
  useEffect(() => {
    const total = view.recentActions.length;
    const prev = prevActionCountRef.current;
    if (total > prev) {
      const newOnes = view.recentActions.slice(prev) as ActionLog[];
      const spawn: JackEffectInstance[] = [];
      for (const a of newOnes) {
        if (a.card.rank !== "J" || !a.pos) continue;
        if (a.type !== "place" && a.type !== "remove") continue;
        const el = document.querySelector(
          `[data-testid="sq-${a.pos.r}-${a.pos.c}"]`,
        );
        if (!el) continue;
        const r = (el as HTMLElement).getBoundingClientRect();
        spawn.push({
          id: `${Date.now()}-${a.pos.r}-${a.pos.c}-${spawn.length}`,
          rect: { left: r.left, top: r.top, width: r.width, height: r.height },
          variant: a.type,
        });
      }
      if (spawn.length > 0) {
        setJackEffects((prev) => [...prev, ...spawn]);
        // Play the distinct two-eyed / one-eyed sound for each effect.
        for (const e of spawn) {
          if (e.variant === "place") playTwoEyedJack();
          else playOneEyedJack();
        }
        const ids = spawn.map((s) => s.id);
        setTimeout(() => {
          setJackEffects((prev) => prev.filter((s) => !ids.includes(s.id)));
        }, 1300);
      }
    }
    prevActionCountRef.current = total;
  }, [view.recentActions]);

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
      // Soft thunk for every chip drop. One sound regardless of how many
      // chips arrived simultaneously (avoids overlap on initial deal).
      playChipDrop();
      const t = setTimeout(() => setJustPlaced(new Set()), 700);
      return () => clearTimeout(t);
    }
  }, [view.chips]);

  const [winStage, setWinStage] = useState<WinStage>("playing");
  const [celebratingTeam, setCelebratingTeam] = useState<Team | null>(null);

  // Per-fivefive celebration window: budget enough time so each winning
  // fivefive's chips can pulse one-at-a-time before the WinOverlay appears.
  // 700ms gap between fivefives × N winning fivefives + 1200ms tail.
  const winningSeqCount = view.winner
    ? view.fivefives.filter((s) => s.team === view.winner).length
    : 0;
  const celebrateDurationMs = Math.max(2200, winningSeqCount * 700 + 1200);

  useEffect(() => {
    if (!view.winner) {
      setWinStage("playing");
      setCelebratingTeam(null);
      return;
    }
    setWinStage("playing");
    // Ascending C-E-G-C-E fanfare on game win.
    playWinFlourish();
    const t1 = setTimeout(() => {
      setCelebratingTeam(view.winner!);
      setWinStage("celebrating");
    }, 1400);
    const t2 = setTimeout(() => setWinStage("overlay"), 1400 + celebrateDurationMs);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [view.winner, celebrateDurationMs]);

  // Highlight is purely local — based on this client's selectedCard state,
  // never broadcast to other players. So it's safe to show even when it's
  // not my turn, as a "where could this card go?" preview.
  function highlight(pos: Pos): "none" | "playable" | "removable" {
    if (!selectedCard || view.winner) return "none";
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
          {myPlayerId === null && (
            <div className="flex justify-center mt-1.5">
              <span
                className="inline-flex items-center gap-1.5 text-[0.65rem] uppercase tracking-widest font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-200"
                data-testid="spectating-pill"
              >
                <span>👁</span>
                Spectating
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main scrollable content. Top padding clears the fixed TurnBar (now
          compact, just badges + counts row); bottom padding clears the fixed
          Last-Played card + Stop button. */}
      <div
        className="min-h-screen flex flex-col items-center p-2 sm:p-4 gap-2 sm:gap-3 pt-24 sm:pt-28 pb-36 sm:pb-40"
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
                disabled={view.winner !== null}
                deck={view.deck}
                onSelect={(id) =>
                  setSelectedCardId((prev) => (prev === id ? null : id))
                }
              />
              {!myTurn && !view.winner && (
                <p className="text-center text-sm" style={{ color: "var(--md-on-surface-variant)" }}>
                  {selectedCard
                    ? `Preview only — waiting for ${view.players[view.turnIdx]?.name ?? "next player"}…`
                    : `Waiting for ${view.players[view.turnIdx]?.name ?? "next player"}…`}
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

      {historyOpen && (
        <LastPlayedHistory
          actions={view.recentActions}
          deck={view.deck}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {/* Stop-game confirmation: centered modal, triggered from the top-right menu. */}
      {isHost && !view.winner && confirmingStop && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overlay-enter"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
          role="alertdialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmingStop(false);
          }}
          data-testid="stop-game-modal"
        >
          <div
            className="w-full max-w-xs rounded-3xl p-5 space-y-4 shadow-2xl text-center"
            style={{ background: "var(--md-surface-1)" }}
          >
            <div className="text-3xl">⏹</div>
            <h2 className="text-lg font-medium tracking-tight">Stop the game?</h2>
            <p className="text-sm" style={{ color: "var(--md-on-surface-variant)" }}>
              Everyone returns to the lobby. Teams are kept, ready flags reset.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setConfirmingStop(false)}
                className="state-layer flex-1 py-2.5 rounded-full font-medium text-zinc-200 bg-transparent border border-zinc-700 hover:border-zinc-500 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmStop}
                data-testid="stop-confirm"
                className="state-layer flex-1 py-2.5 rounded-full font-medium text-white bg-rose-500 hover:bg-rose-400 shadow-sm shadow-rose-900/40"
              >
                Stop game
              </button>
            </div>
          </div>
        </div>
      )}

      {view.winner && winStage === "overlay" && (
        <WinOverlay
          team={view.winner}
          teamName={winnerTeamName ?? "Winner"}
          mvpNames={view.mvpNames}
          room={room}
          myPlayerId={myPlayerId}
          onRematch={onRematch}
          onLeave={onStopGame}
        />
      )}

      {announceTeam && (
        <FivefiveAnnounce
          team={announceTeam}
          teamName={view.teamNames[announceTeam]}
        />
      )}

      {showIntro && view.players.length > 0 && !view.winner && (
        <PreGameCountdown
          firstPlayerName={view.players[view.turnIdx]?.name ?? "Player"}
          firstPlayerTeam={view.players[view.turnIdx]?.team ?? "red"}
          onDone={() => setShowIntro(false)}
        />
      )}

      {!view.winner && (
        <GameMenu
          onOpenStickers={() => setStickerPickerOpen(true)}
          onOpenQuickChat={() => setQuickChatOpen(true)}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenRules={() => setRulesOpen(true)}
          onStopGame={isHost ? () => setConfirmingStop(true) : null}
          roomCode={room?.code ?? ""}
          myPlayerId={myPlayerId}
        />
      )}
      <StickerPicker
        open={stickerPickerOpen}
        onSend={onSendSticker}
        onClose={() => setStickerPickerOpen(false)}
      />
      <QuickChatPicker
        open={quickChatOpen}
        onSend={onSendQuickChat}
        onClose={() => setQuickChatOpen(false)}
      />
      <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <StickerOverlay stickers={stickers} />
      <QuickChatOverlay chats={quickChats} />

      {winStage === "celebrating" && view.winner && (
        <WinFivefiveWalk
          team={view.winner}
          teamName={winnerTeamName ?? "Winner"}
          fivefives={view.fivefives}
          totalDurationMs={celebrateDurationMs}
        />
      )}

      {jackEffects.map((e) => (
        <JackEffect key={e.id} rect={e.rect} variant={e.variant} />
      ))}
    </>
  );
}

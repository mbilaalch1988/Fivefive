/**
 * Faizi — post-game analysis. Reconstructs every state from initial seed +
 * action log, scores each user move against what a strong (Hard-bot) player
 * would have chosen at that moment, and emits a per-move verdict.
 *
 * Lives in `shared` so the same logic runs server-side (REST endpoint) or
 * could be ported to client later. Rating heuristic is independent of the
 * bot engine — Faizi just calls into whatever scorer it's given.
 */

import { buildCardIndex } from "./board.js";
import { cardKey, isOneEyedJack, isTwoEyedJack } from "./cards.js";
import { createInitialState, type SeatInput } from "./state.js";
import { applyAction } from "./rules.js";
import type { Action, Card, GameState, PlayerId, Pos, Team } from "./types.js";
import type { ReplayAction } from "./protocol.js";

export type FaiziRating = "best" | "solid" | "missed" | "mistake";

export interface FaiziMove {
  /** Sequential index into the action log (matches game_actions.action_index). */
  actionIndex: number;
  rating: FaiziRating;
  /** One-line plain-English explanation. */
  summary: string;
  /** The user's actual move, formatted for display. */
  played: string;
  /** What the bot would have done. Empty when rating is "best". */
  recommended: string;
  /** Numeric: 0..1 — how close user's score was to bot's best. */
  closeness: number;
}

export interface FaiziAnalysis {
  /** True when seed was persisted; required for analysis. */
  available: boolean;
  /** Set when not available; explains why. */
  notes?: string;
  moves: FaiziMove[];
  /** Simple aggregate counts. */
  summary: {
    best: number;
    solid: number;
    missed: number;
    mistake: number;
  };
}

/**
 * Look up the card object in a player's hand matching the given rank+suit
 * (there can be 2 copies; either is fine since they're equivalent).
 */
function findHandCard(
  state: GameState,
  playerId: PlayerId,
  rank: string,
  suit: string,
): Card | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;
  return player.hand.find((c) => c.rank === rank && c.suit === suit) ?? null;
}

function formatCard(rank: string, suit: string): string {
  const suitGlyph =
    suit === "S" ? "♠" : suit === "H" ? "♥" : suit === "D" ? "♦" : suit === "C" ? "♣" : suit;
  const rankDisp = rank === "T" ? "10" : rank;
  return `${rankDisp}${suitGlyph}`;
}

function formatPos(pos: Pos | null): string {
  if (!pos) return "";
  return `(${pos.r + 1}, ${pos.c + 1})`;
}

function formatAction(state: GameState, playerId: PlayerId, action: Action): string {
  const player = state.players.find((p) => p.id === playerId);
  // Best-effort: look up the card from id, falling back to a generic label.
  let cardLabel = "card";
  if ("cardId" in action) {
    const card = player?.hand.find((c) => c.id === action.cardId);
    if (card) cardLabel = formatCard(card.rank, card.suit);
  }
  if (action.type === "discardDead") return `discarded dead ${cardLabel}`;
  if (action.type === "remove") return `removed chip at ${formatPos(action.pos)} with ${cardLabel}`;
  return `played ${cardLabel} at ${formatPos(action.pos)}`;
}

/**
 * Replay a game from initial seed + ordered action log. After each user
 * action, capture the pre-move state + the user's intended action so the
 * caller can score it against the bot.
 *
 * Returns null if the seed is null (game predates Faizi).
 */
export interface ReplayCheckpoint {
  /** Index of the action in the full log. */
  actionIndex: number;
  /** GameState as it stood BEFORE this action — pristine snapshot via JSON clone. */
  preState: GameState;
  /** The action the user actually took. */
  action: Action;
}

export function buildCheckpointsForPlayer(
  initialSeed: number,
  seats: SeatInput[],
  sequencesToWin: number,
  deckId: string | null,
  actions: ReplayAction[],
  targetPlayerId: PlayerId,
): ReplayCheckpoint[] {
  const state = createInitialState(seats, { seed: initialSeed, sequencesToWin, deckId });
  // Note: replay actions don't include the random first turn — server set it
  // to a random idx that we don't have stored. We rebuild turn order by
  // tracking who actually played each action.
  const checkpoints: ReplayCheckpoint[] = [];

  for (const ra of actions) {
    // Find the player who took this action by name.
    const player = state.players.find((p) => p.name === ra.playerName);
    if (!player) continue;
    // Set the turn to that player. This works around the missing first-turn
    // info — the action log is the source of truth.
    state.turnIdx = state.players.indexOf(player);

    const card = findHandCard(state, player.id, ra.rank, ra.suit);
    if (!card) continue;

    let action: Action;
    if (ra.type === "place" && ra.pos) {
      action = { type: "place", cardId: card.id, pos: ra.pos };
    } else if (ra.type === "remove" && ra.pos) {
      action = { type: "remove", cardId: card.id, pos: ra.pos };
    } else if (ra.type === "discardDead") {
      action = { type: "discardDead", cardId: card.id };
    } else {
      continue;
    }

    // Capture snapshot BEFORE applying — only when this is the target player.
    if (player.id === targetPlayerId) {
      checkpoints.push({
        actionIndex: ra.index,
        preState: cloneState(state),
        action,
      });
    }
    applyAction(state, player.id, action);
  }
  return checkpoints;
}

/** Deep-clone via JSON. Loses Set instances — re-construct lockedChips. */
function cloneState(state: GameState): GameState {
  const json = JSON.parse(JSON.stringify({
    ...state,
    lockedChips: Array.from(state.lockedChips),
  }));
  return {
    ...json,
    lockedChips: new Set(json.lockedChips as string[]),
  } as GameState;
}

/**
 * Plug in your own scorer (server passes in a function that calls into the
 * Hard-bot logic) and Faizi tells you how the user did vs. the best move.
 *
 * `scorer(state, playerId)` should return an Action plus its numeric score
 * AND every candidate's score so we can find where the user's choice ranked.
 */
export interface MoveScorer {
  (state: GameState, playerId: PlayerId): {
    best: { action: Action; score: number } | null;
    userScore: (action: Action) => number;
  };
}

export function analyzeForPlayer(
  checkpoints: ReplayCheckpoint[],
  playerId: PlayerId,
  scorer: MoveScorer,
): FaiziMove[] {
  const moves: FaiziMove[] = [];
  for (const cp of checkpoints) {
    // discardDead is forced (no choice to score against).
    if (cp.action.type === "discardDead") continue;

    const out = scorer(cp.preState, playerId);
    if (!out.best) continue;
    const bestScore = out.best.score || 1;
    const userScore = out.userScore(cp.action);
    const closeness = Math.max(0, Math.min(1, userScore / bestScore));

    let rating: FaiziRating;
    if (closeness >= 0.92) rating = "best";
    else if (closeness >= 0.7) rating = "solid";
    else if (closeness >= 0.4) rating = "missed";
    else rating = "mistake";

    const played = formatAction(cp.preState, playerId, cp.action);
    const recommended = rating === "best"
      ? ""
      : formatAction(cp.preState, playerId, out.best.action);

    let summary: string;
    if (rating === "best") {
      summary = "Sharp — that was the strongest move available.";
    } else if (rating === "solid") {
      summary = "Reasonable choice. A slightly stronger option existed.";
    } else if (rating === "missed") {
      summary = `Missed opportunity — ${recommended} would have scored better.`;
    } else {
      summary = `Mistake — ${recommended} was significantly stronger here.`;
    }

    moves.push({
      actionIndex: cp.actionIndex,
      rating,
      summary,
      played,
      recommended,
      closeness,
    });
  }
  return moves;
}

export function summarizeFaiziMoves(moves: FaiziMove[]): FaiziAnalysis["summary"] {
  const out = { best: 0, solid: 0, missed: 0, mistake: 0 };
  for (const m of moves) out[m.rating] += 1;
  return out;
}

// Re-exports used by client-side rendering.
export type { Card };
export { buildCardIndex };

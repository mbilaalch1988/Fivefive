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
  fivefivesToWin: number,
  deckId: string | null,
  actions: ReplayAction[],
  targetPlayerId: PlayerId,
): ReplayCheckpoint[] {
  const state = createInitialState(seats, { seed: initialSeed, fivefivesToWin, deckId });
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
 * Returns the rank (1-indexed) and score of the user's chosen action within
 * the sorted candidate list, plus the bot's best move. Faizi uses BOTH the
 * rank AND the absolute gap (best.score − userScore) so a player who picks
 * a "reasonable but not optimal" move when the bot found a +1000 sequence
 * doesn't get scored as 9% closeness → mistake.
 */
export interface MoveScorer {
  (state: GameState, playerId: PlayerId): {
    best: { action: Action; score: number } | null;
    /** Look up the user's rank (1 = best) + score in the sorted candidates. */
    userRankAndScore: (action: Action) => {
      rank: number;
      score: number;
      totalCandidates: number;
    };
  };
}

/**
 * Rank- and gap-based rating. Gap fallback exists so that when many moves
 * score similarly, "I picked the 2nd-best out of 12" reads as best (not a
 * mistake). Numbers tuned against typical scorePlace() ranges:
 *   sequence completion ≈ 1000
 *   4-in-a-row extension ≈ 90
 *   normal placement ≈ 10–35
 *   defensive block ≈ 60–200
 */
function rateMove(
  rank: number,
  userScore: number,
  bestScore: number,
): FaiziRating {
  const gap = Math.max(0, bestScore - userScore);
  if (rank === 1 || gap <= 50) return "best";
  if (rank <= 3 || gap <= 150) return "solid";
  if (rank <= 8 || gap <= 400) return "missed";
  return "mistake";
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
    const bestScore = out.best.score;
    const { rank, score: userScore } = out.userRankAndScore(cp.action);
    const rating = rateMove(rank, userScore, bestScore);
    // Keep closeness as a presentational metric (the % bar in the UI) even
    // though it no longer drives the tier directly.
    const closeness = bestScore > 0
      ? Math.max(0, Math.min(1, userScore / bestScore))
      : 1;

    const played = formatAction(cp.preState, playerId, cp.action);
    const recommended = rating === "best"
      ? ""
      : formatAction(cp.preState, playerId, out.best.action);

    let summary: string;
    if (rating === "best") {
      summary = "Sharp — that was the strongest move available.";
    } else if (rating === "solid") {
      summary = `Reasonable. ${recommended || "Bot's top pick"} was slightly stronger.`;
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

/* ============================================================== */
/* Faizi Roast — everyone's analysis as satirical commentary      */
/* ============================================================== */

export interface RoastPlayer {
  playerId: PlayerId;
  name: string;
  team: Team;
  totalMoves: number;
  /** Best + Solid as a percentage of scorable moves. */
  qualityPct: number;
  summary: FaiziAnalysis["summary"];
  /** Title chosen from QUALITY_TITLES based on qualityPct. */
  title: string;
  /** One-liner tagline matching the title. */
  tagline: string;
  /** Closeness of the player's WORST scorable move (lowest closeness). */
  lowestCloseness: number;
}

export interface RoastAward {
  /** Stable id used for icons. */
  id:
    | "sniper"
    | "diplomat"
    | "cool_hand"
    | "drama"
    | "mvp_of_bad_calls"
    | "entertainer"
    | "consistent"
    | "wildcard";
  icon: string;
  title: string;
  /** Player name and what they did to earn it. */
  winnerName: string;
  detail: string;
}

export interface FaiziRoast {
  available: boolean;
  notes?: string;
  players: RoastPlayer[];
  awards: RoastAward[];
  /** Optional headline served above the player list. */
  headline: string;
}

/**
 * Satirical title for a player based on quality% — the calmer the player,
 * the smugger the title; the more chaos, the more affection.
 */
const QUALITY_TITLES: Array<{ min: number; title: string; tagline: string }> = [
  { min: 90, title: "🧠 The Mastermind",        tagline: "Played like the bot was on their payroll" },
  { min: 80, title: "📐 The Strategist",        tagline: "Read the board so hard the cards filed a complaint" },
  { min: 70, title: "🎯 The Sharpshooter",      tagline: "Picked the right square more often than not" },
  { min: 60, title: "🧊 The Calculator",        tagline: "Most decisions had a faint whiff of math" },
  { min: 50, title: "🎲 The Coin-Flipper",      tagline: "Half their plays paid off. Coin tosses do the same" },
  { min: 40, title: "🎨 The Free Spirit",       tagline: "Played by feel. The feelings were mixed" },
  { min: 30, title: "🤔 The Improviser",        tagline: "Made it up as they went, sometimes spectacularly" },
  { min: 20, title: "🌪 The Tornado",           tagline: "Left a trail of confused chips in their wake" },
  { min: 10, title: "💥 The Wildcard",          tagline: "Possibly playing a different game entirely" },
  { min:  0, title: "🛼 The Free Wheeler",      tagline: "Aggressively allergic to optimal play. Iconic" },
];

function titleFor(qualityPct: number): { title: string; tagline: string } {
  for (const entry of QUALITY_TITLES) {
    if (qualityPct >= entry.min) return { title: entry.title, tagline: entry.tagline };
  }
  return QUALITY_TITLES[QUALITY_TITLES.length - 1]!;
}

/** Aggregate quality % from a player's move list. Returns 0 if no scorable moves. */
function qualityPct(summary: FaiziAnalysis["summary"], totalMoves: number): number {
  if (totalMoves === 0) return 0;
  return Math.round(((summary.best + summary.solid) / totalMoves) * 100);
}

/** Lowest closeness in the player's moves (or 1 if none). */
function lowestCloseness(moves: FaiziMove[]): number {
  if (moves.length === 0) return 1;
  let lo = 1;
  for (const m of moves) if (m.closeness < lo) lo = m.closeness;
  return lo;
}

/**
 * Build the satirical roast object given a Map of per-player analyzed moves.
 * Generates one title per player + awards across the field.
 */
export function buildFaiziRoast(
  perPlayer: Array<{
    playerId: PlayerId;
    name: string;
    team: Team;
    moves: FaiziMove[];
  }>,
): { players: RoastPlayer[]; awards: RoastAward[]; headline: string } {
  const players: RoastPlayer[] = perPlayer.map((p) => {
    const summary = summarizeFaiziMoves(p.moves);
    const total = p.moves.length;
    const q = qualityPct(summary, total);
    const t = titleFor(q);
    return {
      playerId: p.playerId,
      name: p.name,
      team: p.team,
      totalMoves: total,
      qualityPct: q,
      summary,
      title: t.title,
      tagline: t.tagline,
      lowestCloseness: lowestCloseness(p.moves),
    };
  });

  // Awards — only emit when we have at least 2 players to compare against.
  const awards: RoastAward[] = [];
  if (players.length >= 2) {
    // 🎯 Sniper — most best-rated moves.
    const sniper = pickMax(players, (p) => p.summary.best);
    if (sniper && sniper.summary.best > 0) {
      awards.push({
        id: "sniper",
        icon: "🎯",
        title: "Sniper",
        winnerName: sniper.name,
        detail: `${sniper.summary.best} pixel-perfect moves. Disgusting.`,
      });
    }
    // 💀 MVP of Bad Calls — most mistakes.
    const blunderer = pickMax(players, (p) => p.summary.mistake);
    if (blunderer && blunderer.summary.mistake > 0) {
      awards.push({
        id: "mvp_of_bad_calls",
        icon: "💀",
        title: "MVP of Bad Calls",
        winnerName: blunderer.name,
        detail: `${blunderer.summary.mistake} certified mistakes. Owned the lane.`,
      });
    }
    // 🚨 Drama Award — single most painful blunder (lowest closeness).
    const drama = players.reduce<RoastPlayer | null>(
      (best, p) =>
        p.totalMoves > 0 && (!best || p.lowestCloseness < best.lowestCloseness)
          ? p
          : best,
      null,
    );
    if (drama && drama.lowestCloseness < 0.25) {
      awards.push({
        id: "drama",
        icon: "🚨",
        title: "Drama Award",
        winnerName: drama.name,
        detail: `Pulled off a move so wrong it deserves a documentary.`,
      });
    }
    // 🧊 Cool Hand — most solid moves.
    const cool = pickMax(players, (p) => p.summary.solid);
    if (cool && cool.summary.solid > 0) {
      awards.push({
        id: "cool_hand",
        icon: "🧊",
        title: "Cool Hand",
        winnerName: cool.name,
        detail: `${cool.summary.solid} respectable, unflashy plays. Reliable.`,
      });
    }
    // 🤝 The Diplomat — fewest mistakes (high standards required).
    const diplomat = players.reduce<RoastPlayer | null>(
      (best, p) =>
        p.totalMoves >= 5 &&
        (!best || p.summary.mistake < best.summary.mistake)
          ? p
          : best,
      null,
    );
    if (diplomat && diplomat.summary.mistake === 0) {
      awards.push({
        id: "diplomat",
        icon: "🤝",
        title: "The Diplomat",
        winnerName: diplomat.name,
        detail: "Made zero mistakes. Suspicious. We're investigating.",
      });
    }
    // 🎪 Entertainer — widest spread (best > 0 AND mistake > 0, highest sum).
    const entertainer = players.reduce<{ p: RoastPlayer; spread: number } | null>(
      (best, p) => {
        const spread = p.summary.best + p.summary.mistake;
        if (p.summary.best === 0 || p.summary.mistake === 0) return best;
        if (!best || spread > best.spread) return { p, spread };
        return best;
      },
      null,
    );
    if (entertainer) {
      awards.push({
        id: "entertainer",
        icon: "🎪",
        title: "Most Entertaining",
        winnerName: entertainer.p.name,
        detail: "Brilliant one turn, baffling the next. Range.",
      });
    }
  }

  // Headline — playful framing for the modal.
  const sorted = [...players].sort((a, b) => b.qualityPct - a.qualityPct);
  let headline: string;
  if (sorted.length === 0) {
    headline = "Nothing to roast. Suspicious silence.";
  } else if (sorted[0]!.qualityPct >= 90) {
    headline = `${sorted[0]!.name} was unhinged in a good way.`;
  } else if (sorted[sorted.length - 1]!.qualityPct < 25) {
    headline = `Tough day at the table. Faizi has notes.`;
  } else {
    headline = "Faizi's hot takes from the table:";
  }

  return { players: sorted, awards, headline };
}

function pickMax<T>(arr: T[], key: (x: T) => number): T | null {
  if (arr.length === 0) return null;
  let best = arr[0]!;
  let bestKey = key(best);
  for (let i = 1; i < arr.length; i++) {
    const k = key(arr[i]!);
    if (k > bestKey) {
      best = arr[i]!;
      bestKey = k;
    }
  }
  return best;
}

// Re-exports used by client-side rendering.
export type { Card };
export { buildCardIndex };

import { buildCardIndex, isCornerPos, posKey } from "./board.js";
import { cardKey, isOneEyedJack, isTwoEyedJack } from "./cards.js";
import { mulberry32, shuffle } from "./rng.js";
import { detectFivefives, lockFivefiveChips } from "./fivefive.js";
import type {
  Action,
  ActionLog,
  ActionResult,
  Card,
  GameState,
  Player,
  PlayerId,
  Pos,
  Team,
} from "./types.js";

const ACTION_LOG_CAP = 10;

function logAction(state: GameState, entry: ActionLog): void {
  state.actionLog.push(entry);
  if (state.actionLog.length > ACTION_LOG_CAP) {
    state.actionLog.splice(0, state.actionLog.length - ACTION_LOG_CAP);
  }
}

function err(msg: string): ActionResult {
  return { ok: false, error: msg };
}

function findCardInHand(player: Player, cardId: number): Card | undefined {
  return player.hand.find((c) => c.id === cardId);
}

function removeFromHand(player: Player, cardId: number): Card {
  const idx = player.hand.findIndex((c) => c.id === cardId);
  if (idx < 0) throw new Error("card not in hand");
  const [card] = player.hand.splice(idx, 1);
  return card!;
}

function drawForPlayer(state: GameState, player: Player): void {
  // Per official rules: if the draw pile is empty, the discard is reshuffled
  // back into the draw pile. Deterministic via the existing config seed
  // mixed with the action-log length so the same game state always produces
  // the same shuffle (important for replay / rejoin parity).
  if (state.drawPile.length === 0 && state.discardPile.length > 0) {
    const rand = mulberry32((state.config.seed ^ 0xdeadbeef) + state.actionLog.length);
    state.drawPile = shuffle(state.discardPile, rand);
    state.discardPile = [];
  }
  if (state.drawPile.length === 0) return;
  const card = state.drawPile.pop()!;
  player.hand.push(card);
}

/**
 * Pick one legal Action for the player whose turn it is, sampled uniformly
 * at random across all (card × valid-target) options. Used by the per-turn
 * timer auto-play. Falls back to discardDead if a dead card is in hand and
 * we haven't discarded yet. Returns null when the player is completely
 * stuck (the deadlock detector will end the game).
 */
export function pickRandomLegalAction(
  state: GameState,
  playerId: PlayerId,
): Action | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || state.winner) return null;
  if (state.players[state.turnIdx]?.id !== playerId) return null;

  const candidates: Action[] = [];
  const idx = buildCardIndex(state.board);
  for (const card of player.hand) {
    if (isTwoEyedJack(card)) {
      for (let r = 0; r < state.board.length; r++) {
        const row = state.board[r]!;
        for (let c = 0; c < row.length; c++) {
          if (row[c]!.kind === "card" && state.chips[r]![c] === null) {
            candidates.push({ type: "place", cardId: card.id, pos: { r, c } });
          }
        }
      }
      continue;
    }
    if (isOneEyedJack(card)) {
      for (let r = 0; r < state.board.length; r++) {
        const row = state.board[r]!;
        for (let c = 0; c < row.length; c++) {
          if (row[c]!.kind !== "card") continue;
          const chip = state.chips[r]![c];
          if (chip !== null && chip !== player.team && !state.lockedChips.has(`${r},${c}`)) {
            candidates.push({ type: "remove", cardId: card.id, pos: { r, c } });
          }
        }
      }
      continue;
    }
    const positions = idx.get(cardKey(card.rank, card.suit)) ?? [];
    for (const p of positions) {
      if (state.chips[p.r]![p.c] === null) {
        candidates.push({ type: "place", cardId: card.id, pos: p });
      }
    }
  }
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)]!;
  }
  // No legal placement — try discardDead.
  if (!state.discardedThisTurn) {
    for (const card of player.hand) {
      if (card.rank === "J") continue;
      const positions = idx.get(cardKey(card.rank, card.suit)) ?? [];
      if (positions.length > 0 && positions.every((p) => state.chips[p.r]![p.c] !== null)) {
        return { type: "discardDead", cardId: card.id };
      }
    }
  }
  return null;
}

/** True if `player` has at least one card they could legally play right now. */
function playerHasLegalMove(state: GameState, player: Player): boolean {
  if (player.hand.length === 0) return false;
  const idx = buildCardIndex(state.board);
  for (const card of player.hand) {
    if (isTwoEyedJack(card)) {
      // Wild — any empty non-corner square is playable.
      for (let r = 0; r < state.board.length; r++) {
        const row = state.board[r]!;
        for (let c = 0; c < row.length; c++) {
          if (row[c]!.kind === "card" && state.chips[r]![c] === null) return true;
        }
      }
      continue;
    }
    if (isOneEyedJack(card)) {
      // Remover — any opponent chip that isn't part of a sequence.
      for (let r = 0; r < state.board.length; r++) {
        const row = state.board[r]!;
        for (let c = 0; c < row.length; c++) {
          if (row[c]!.kind !== "card") continue;
          const chip = state.chips[r]![c];
          if (chip !== null && chip !== player.team && !state.lockedChips.has(`${r},${c}`)) {
            return true;
          }
        }
      }
      continue;
    }
    const positions = idx.get(cardKey(card.rank, card.suit)) ?? [];
    for (const p of positions) {
      if (state.chips[p.r]![p.c] === null) return true;
    }
  }
  return false;
}

/**
 * After a turn ends, detect whether the game has hit a deadlock — nobody
 * can play AND the draw pile is empty. If so, declare a winner: team with
 * the most completed sequences; tie-breaker is total chips placed on the
 * board (most chips = most contribution).
 */
function maybeEndOnDeadlock(state: GameState): void {
  if (state.winner) return;
  if (state.drawPile.length > 0) return;
  // If anyone can still play, no deadlock.
  for (const p of state.players) {
    if (playerHasLegalMove(state, p)) return;
  }

  const seqCount: Record<Team, number> = { red: 0, blue: 0, green: 0 };
  for (const seq of state.sequences) seqCount[seq.team] += 1;
  const chipCount: Record<Team, number> = { red: 0, blue: 0, green: 0 };
  for (let r = 0; r < state.chips.length; r++) {
    const row = state.chips[r]!;
    for (let c = 0; c < row.length; c++) {
      const chip = row[c];
      if (chip) chipCount[chip] += 1;
    }
  }

  // Only consider teams that actually have at least one seated player.
  const teamsInPlay = new Set<Team>(state.players.map((p) => p.team));
  let winner: Team | null = null;
  let bestSeqs = -1;
  let bestChips = -1;
  for (const team of teamsInPlay) {
    const seqs = seqCount[team];
    const chips = chipCount[team];
    if (seqs > bestSeqs || (seqs === bestSeqs && chips > bestChips)) {
      winner = team;
      bestSeqs = seqs;
      bestChips = chips;
    }
  }
  state.winner = winner;
  // winningFivefivePlayerId stays null — no chip closed a winning sequence.
}

function endTurn(state: GameState): void {
  state.turnIdx = (state.turnIdx + 1) % state.players.length;
  state.discardedThisTurn = false;
  maybeEndOnDeadlock(state);
}

function isDeadCard(state: GameState, card: Card): boolean {
  // Jacks are never "dead" — they have no fixed board square.
  if (card.rank === "J") return false;
  const idx = buildCardIndex(state.board);
  const positions = idx.get(cardKey(card.rank, card.suit)) ?? [];
  return positions.every((p) => state.chips[p.r]![p.c] !== null);
}

export function applyAction(
  state: GameState,
  playerId: PlayerId,
  action: Action,
): ActionResult {
  if (state.winner) return err("game is over");
  const player = state.players[state.turnIdx]!;
  if (player.id !== playerId) return err("not your turn");

  switch (action.type) {
    case "discardDead":
      return applyDiscardDead(state, player, action.cardId);
    case "place":
      return applyPlace(state, player, action.cardId, action.pos);
    case "remove":
      return applyRemove(state, player, action.cardId, action.pos);
  }
}

function applyDiscardDead(
  state: GameState,
  player: Player,
  cardId: number,
): ActionResult {
  if (state.discardedThisTurn) {
    return err("already discarded a dead card this turn");
  }
  const card = findCardInHand(player, cardId);
  if (!card) return err("card not in hand");
  if (!isDeadCard(state, card)) return err("card is not dead");

  removeFromHand(player, cardId);
  state.discardPile.push(card);
  drawForPlayer(state, player);
  state.discardedThisTurn = true;
  logAction(state, {
    playerId: player.id,
    playerName: player.name,
    card: { rank: card.rank, suit: card.suit },
    type: "discardDead",
  });
  // Discarding doesn't end the turn; player still owes a play.
  return { ok: true, state };
}

function applyPlace(
  state: GameState,
  player: Player,
  cardId: number,
  pos: Pos,
): ActionResult {
  const card = findCardInHand(player, cardId);
  if (!card) return err("card not in hand");

  const square = state.board[pos.r]?.[pos.c];
  if (!square) return err("position out of bounds");
  if (square.kind === "corner") return err("cannot place on corner");
  if (state.chips[pos.r]![pos.c] !== null) return err("square already occupied");

  // One-eyed Jacks remove; they cannot place.
  if (isOneEyedJack(card)) return err("one-eyed Jack removes, doesn't place");

  if (isTwoEyedJack(card)) {
    // Wild placement allowed anywhere empty (already checked).
  } else {
    if (square.rank !== card.rank || square.suit !== card.suit) {
      return err("card does not match this square");
    }
  }

  state.chips[pos.r]![pos.c] = player.team;
  removeFromHand(player, cardId);
  state.discardPile.push(card);
  drawForPlayer(state, player);
  player.stats.chipsPlaced += 1;
  logAction(state, {
    playerId: player.id,
    playerName: player.name,
    card: { rank: card.rank, suit: card.suit },
    type: "place",
    pos,
    targetSquare:
      square.kind === "card" ? { rank: square.rank, suit: square.suit } : undefined,
  });

  // Check for new sequences and update win state.
  const newSeqs = detectFivefives(
    state.chips,
    pos,
    player.team,
    state.lockedChips,
  );
  for (const seq of newSeqs) {
    state.sequences.push(seq);
    lockFivefiveChips(state.lockedChips, seq);
  }
  player.stats.fivefivesClosed += newSeqs.length;

  const teamSeqCount = state.sequences.filter((s) => s.team === player.team).length;
  if (teamSeqCount >= state.config.fivefivesToWin) {
    state.winner = player.team;
    state.winningFivefivePlayerId = player.id;
    return { ok: true, state };
  }

  endTurn(state);
  return { ok: true, state };
}

function applyRemove(
  state: GameState,
  player: Player,
  cardId: number,
  pos: Pos,
): ActionResult {
  const card = findCardInHand(player, cardId);
  if (!card) return err("card not in hand");
  if (!isOneEyedJack(card)) return err("only a one-eyed Jack can remove");

  const square = state.board[pos.r]?.[pos.c];
  if (!square) return err("position out of bounds");
  if (square.kind === "corner") return err("cannot remove from a corner");

  const chip = state.chips[pos.r]![pos.c];
  if (chip === null) return err("no chip to remove");
  if (chip === player.team) return err("cannot remove your own chip");
  if (state.lockedChips.has(posKey(pos))) {
    return err("chip is part of a completed sequence");
  }

  state.chips[pos.r]![pos.c] = null;
  removeFromHand(player, cardId);
  state.discardPile.push(card);
  drawForPlayer(state, player);
  player.stats.chipsRemoved += 1;
  logAction(state, {
    playerId: player.id,
    playerName: player.name,
    card: { rank: card.rank, suit: card.suit },
    type: "remove",
    pos,
    targetSquare:
      square.kind === "card" ? { rank: square.rank, suit: square.suit } : undefined,
  });

  endTurn(state);
  return { ok: true, state };
}

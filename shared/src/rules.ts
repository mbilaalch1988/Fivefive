import { buildCardIndex, isCornerPos, posKey } from "./board.js";
import { cardKey, isOneEyedJack, isTwoEyedJack } from "./cards.js";
import { detectSequences, lockSequenceChips } from "./sequence.js";
import type {
  Action,
  ActionResult,
  Card,
  GameState,
  Player,
  PlayerId,
  Pos,
} from "./types.js";

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
  // Per official rules: if the draw pile is empty, the discard is reshuffled.
  // We treat discard as "unused"; for MVP, simply skip the draw if both empty.
  if (state.drawPile.length === 0) return;
  const card = state.drawPile.pop()!;
  player.hand.push(card);
}

function endTurn(state: GameState): void {
  state.turnIdx = (state.turnIdx + 1) % state.players.length;
  state.discardedThisTurn = false;
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

  // Check for new sequences and update win state.
  const newSeqs = detectSequences(
    state.chips,
    pos,
    player.team,
    state.lockedChips,
  );
  for (const seq of newSeqs) {
    state.sequences.push(seq);
    lockSequenceChips(state.lockedChips, seq);
  }
  player.stats.sequencesClosed += newSeqs.length;

  const teamSeqCount = state.sequences.filter((s) => s.team === player.team).length;
  if (teamSeqCount >= state.config.sequencesToWin) {
    state.winner = player.team;
    state.winningSequencePlayerId = player.id;
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

  endTurn(state);
  return { ok: true, state };
}

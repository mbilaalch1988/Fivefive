/**
 * Server-side bot decision engine. Pure function over GameState — no side
 * effects, no socket I/O. Caller (index.ts) schedules a delay and dispatches
 * the returned Action via Room.applyAction so persistence, sequence
 * detection, win checks, and replay logging all stay on the normal path.
 */

import {
  buildCardIndex,
  cardKey,
  isOneEyedJack,
  isTwoEyedJack,
  type Action,
  type BoardSquare,
  type Chip,
  type GameState,
  type PlayerId,
  type Pos,
  type Team,
} from "@sequence/shared";

export type BotDifficulty = "easy" | "medium";

interface ScoredAction {
  action: Action;
  score: number;
}

export function botDecide(
  state: GameState,
  playerId: PlayerId,
  difficulty: BotDifficulty,
): Action | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;
  if (state.winner) return null;

  // 1. If we have a dead card and haven't discarded yet, do that first.
  //    The bot will be re-invoked after the discard to play a real action.
  if (!state.discardedThisTurn) {
    const idx = buildCardIndex(state.board);
    for (const card of player.hand) {
      if (card.rank === "J") continue;
      const positions = idx.get(cardKey(card.rank, card.suit)) ?? [];
      if (positions.length > 0 && positions.every((p) => state.chips[p.r]![p.c] !== null)) {
        return { type: "discardDead", cardId: card.id };
      }
    }
  }

  // 2. Build candidate actions across every card in hand.
  const candidates: ScoredAction[] = [];
  const board = state.board;
  const chips = state.chips;
  const idx = buildCardIndex(state.board);

  for (const card of player.hand) {
    if (isOneEyedJack(card)) {
      // Target opponent chips that aren't locked. Prefer chips on an
      // existing run (they're closer to completing a sequence).
      for (let r = 0; r < chips.length; r++) {
        const row = chips[r]!;
        for (let c = 0; c < row.length; c++) {
          const chip = row[c];
          if (!chip || chip === player.team) continue;
          if (state.lockedChips.has(`${r},${c}`)) continue;
          const danger = maxRunThroughPos(chips, board, { r, c }, chip as Team);
          const score = danger >= 4 ? 600 : danger >= 3 ? 90 : danger >= 2 ? 25 : 8;
          candidates.push({
            action: { type: "remove", cardId: card.id, pos: { r, c } },
            score,
          });
        }
      }
    } else if (isTwoEyedJack(card)) {
      // Wild placement — every empty non-corner square is a candidate.
      // Two-eyed jacks are rare; reserve them for high-leverage spots so we
      // don't burn one putting a chip in dead space.
      for (let r = 0; r < board.length; r++) {
        const row = board[r]!;
        for (let c = 0; c < row.length; c++) {
          const sq = row[c]!;
          if (sq.kind === "corner") continue;
          if (chips[r]![c] !== null) continue;
          // Penalty: don't waste wilds on low-value spots.
          const placeScore = scorePlace(chips, board, { r, c }, player.team);
          const score = placeScore - 12;
          candidates.push({
            action: { type: "place", cardId: card.id, pos: { r, c } },
            score,
          });
        }
      }
    } else {
      // Regular card — only the two matching squares are valid.
      const positions = idx.get(cardKey(card.rank, card.suit)) ?? [];
      for (const pos of positions) {
        if (chips[pos.r]![pos.c] !== null) continue;
        const score = scorePlace(chips, board, pos, player.team);
        candidates.push({
          action: { type: "place", cardId: card.id, pos },
          score,
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  if (difficulty === "easy") {
    // Easy bots play near-random — keeps them beatable. 70% random, 30% best.
    if (Math.random() < 0.7) {
      return candidates[Math.floor(Math.random() * candidates.length)]!.action;
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]!.action;
}

/**
 * Score a hypothetical placement at `pos` for `team`. Considers:
 *  - Run length created (5 = sequence, 4 = primed, 3 = building)
 *  - Defensive: blocks an opponent who would have run-length 4 here
 *  - Corner adjacency bonus
 */
function scorePlace(
  chips: Chip[][],
  board: BoardSquare[][],
  pos: Pos,
  team: Team,
): number {
  let score = 0;

  // Hypothetically place our chip and measure our longest run through pos.
  chips[pos.r]![pos.c] = team;
  const ourRun = maxRunThroughPos(chips, board, pos, team);
  chips[pos.r]![pos.c] = null;
  if (ourRun >= 5) score += 1000;
  else if (ourRun >= 4) score += 90;
  else if (ourRun >= 3) score += 35;
  else if (ourRun >= 2) score += 10;

  // Defensive: what's the longest opponent run that PASSES THROUGH pos?
  // If high, placing here blocks them.
  for (const opp of opposingTeams(team)) {
    chips[pos.r]![pos.c] = opp;
    const oppRun = maxRunThroughPos(chips, board, pos, opp);
    chips[pos.r]![pos.c] = null;
    if (oppRun >= 5) score += 200; // would-be opponent sequence — major block
    else if (oppRun >= 4) score += 60;
    else if (oppRun >= 3) score += 20;
  }

  if (nearCorner(pos, board.length)) score += 6;
  return score;
}

/**
 * Longest run of `team`-aligned chips passing through pos in any of the
 * 4 axes. Corners are wild — count as friendly for any team.
 */
function maxRunThroughPos(
  chips: Chip[][],
  board: BoardSquare[][],
  pos: Pos,
  team: Team,
): number {
  const directions: Array<[number, number]> = [
    [0, 1], [1, 0], [1, 1], [1, -1],
  ];
  let best = 0;
  for (const [dr, dc] of directions) {
    const a = walkRun(chips, board, pos, team, dr, dc);
    const b = walkRun(chips, board, pos, team, -dr, -dc);
    const total = a + b + 1; // +1 = the chip at pos itself
    if (total > best) best = total;
  }
  return best;
}

function walkRun(
  chips: Chip[][],
  board: BoardSquare[][],
  pos: Pos,
  team: Team,
  dr: number,
  dc: number,
): number {
  let r = pos.r + dr;
  let c = pos.c + dc;
  let count = 0;
  while (r >= 0 && r < chips.length && c >= 0 && c < chips[0]!.length) {
    const sq = board[r]![c]!;
    const chip = chips[r]![c];
    // Corner squares are wild — count as friendly.
    const friendly = sq.kind === "corner" || chip === team;
    if (!friendly) break;
    count += 1;
    r += dr;
    c += dc;
  }
  return count;
}

function nearCorner(pos: Pos, n: number): boolean {
  const corners: Pos[] = [
    { r: 0, c: 0 },
    { r: 0, c: n - 1 },
    { r: n - 1, c: 0 },
    { r: n - 1, c: n - 1 },
  ];
  return corners.some(
    (cn) => Math.abs(pos.r - cn.r) + Math.abs(pos.c - cn.c) <= 2,
  );
}

function opposingTeams(team: Team): Team[] {
  return (["red", "blue", "green"] as Team[]).filter((t) => t !== team);
}

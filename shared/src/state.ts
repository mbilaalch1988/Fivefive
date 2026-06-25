import { generateBoard, BOARD_SIZE } from "./board.js";
import { createDeck } from "./cards.js";
import { mulberry32, shuffle } from "./rng.js";
import type { Card, Chip, GameConfig, GameState, Player, Team } from "./types.js";

/** Hand sizes by player count — one card below the official Fivefive
 *  rule book at each bracket. Smaller hands speed up turns and reduce
 *  dead-card buildup, which matters on phones.
 *  ≤4 players → 6 cards · 5-7 players → 5 · 8+ players → 4. */
export function defaultHandSize(playerCount: number): number {
  if (playerCount <= 4) return 6;
  if (playerCount <= 7) return 5;
  return 4;
}

/** Fivefives needed to win, by team count. */
export function defaultFivefivesToWin(teamCount: number): number {
  return teamCount === 3 ? 1 : 2;
}

export interface SeatInput {
  id: string;
  name: string;
  team: Team;
}

export function createInitialState(
  seats: SeatInput[],
  configOverride: Partial<GameConfig> = {},
): GameState {
  if (seats.length < 2) throw new Error("Need at least 2 players");
  const teams = new Set(seats.map((s) => s.team));
  const seed = configOverride.seed ?? Math.floor(Math.random() * 2 ** 31);
  const handSize = configOverride.handSize ?? defaultHandSize(seats.length);
  const fivefivesToWin =
    configOverride.fivefivesToWin ?? defaultFivefivesToWin(teams.size);
  const deckId = configOverride.deckId ?? null;

  const config: GameConfig = { seed, handSize, fivefivesToWin, deckId };

  const board = generateBoard(seed);
  const chips: Chip[][] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    chips.push(new Array(BOARD_SIZE).fill(null));
  }

  const rand = mulberry32(seed ^ 0x9e3779b9); // distinct stream for deck
  const deck = shuffle(createDeck(), rand);

  // Seat order = play order. Deal one card at a time around the table.
  const players: Player[] = seats.map((s) => ({
    id: s.id,
    name: s.name,
    team: s.team,
    hand: [],
    stats: { chipsPlaced: 0, chipsRemoved: 0, fivefivesClosed: 0 },
  }));

  for (let i = 0; i < handSize; i++) {
    for (const p of players) {
      const card = deck.pop();
      if (!card) throw new Error("Deck exhausted while dealing");
      p.hand.push(card);
    }
  }

  return {
    config,
    board,
    chips,
    players,
    turnIdx: 0,
    drawPile: deck,
    discardPile: [],
    fivefives: [],
    lockedChips: new Set<string>(),
    winner: null,
    winningFivefivePlayerId: null,
    discardedThisTurn: false,
    actionLog: [],
  };
}

export function currentPlayer(state: GameState): Player {
  const p = state.players[state.turnIdx];
  if (!p) throw new Error("No current player");
  return p;
}

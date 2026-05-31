import { generateBoard, BOARD_SIZE } from "./board.js";
import { createDeck } from "./cards.js";
import { mulberry32, shuffle } from "./rng.js";
import type { Card, Chip, GameConfig, GameState, Player, Team } from "./types.js";

/** Standard Sequence hand sizes by player count. */
export function defaultHandSize(playerCount: number): number {
  if (playerCount <= 2) return 7;
  if (playerCount <= 3) return 6;
  if (playerCount <= 4) return 7;
  if (playerCount <= 6) return 6;
  if (playerCount <= 8) return 5;
  return 4;
}

/** Sequences needed to win, by team count. */
export function defaultSequencesToWin(teamCount: number): number {
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
  const sequencesToWin =
    configOverride.sequencesToWin ?? defaultSequencesToWin(teams.size);
  const deckId = configOverride.deckId ?? null;

  const config: GameConfig = { seed, handSize, sequencesToWin, deckId };

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
    stats: { chipsPlaced: 0, chipsRemoved: 0, sequencesClosed: 0 },
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
    sequences: [],
    lockedChips: new Set<string>(),
    winner: null,
    winningSequencePlayerId: null,
    discardedThisTurn: false,
    actionLog: [],
  };
}

export function currentPlayer(state: GameState): Player {
  const p = state.players[state.turnIdx];
  if (!p) throw new Error("No current player");
  return p;
}

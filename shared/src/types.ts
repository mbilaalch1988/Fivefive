export type Suit = "S" | "H" | "D" | "C";
export type Rank =
  | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T"
  | "J" | "Q" | "K" | "A";

export interface Card {
  /** Unique within a single deck (0..103). Lets us distinguish the two copies of the same rank+suit. */
  id: number;
  rank: Rank;
  suit: Suit;
}

export type Team = "red" | "blue" | "green";

export interface Pos {
  r: number;
  c: number;
}

export type BoardSquare =
  | { kind: "corner" }
  | { kind: "card"; rank: Rank; suit: Suit };

export type Chip = Team | null;

export type PlayerId = string;

export interface Player {
  id: PlayerId;
  name: string;
  team: Team;
  /** Cards currently held. Ordered by play order is irrelevant; rendering can sort. */
  hand: Card[];
}

export type Action =
  /** Play a numeric/face card or a two-eyed Jack to place a chip. */
  | { type: "place"; cardId: number; pos: Pos }
  /** Play a one-eyed Jack to remove an opponent's chip (not one in a completed sequence). */
  | { type: "remove"; cardId: number; pos: Pos }
  /** Discard a dead card (both matching board squares already occupied) before playing. */
  | { type: "discardDead"; cardId: number };

export interface Sequence {
  team: Team;
  positions: Pos[]; // exactly 5
}

export interface GameConfig {
  /** Number of completed sequences a team needs to win. */
  sequencesToWin: number;
  /** Cards dealt per player. Derived from player count if omitted. */
  handSize: number;
  /** RNG seed for deterministic deck shuffle + board generation. */
  seed: number;
}

export interface GameState {
  config: GameConfig;
  board: BoardSquare[][]; // [row][col]
  chips: Chip[][];        // [row][col]
  players: Player[];
  turnIdx: number;
  /** Cards remaining to draw, top at end (pop). */
  drawPile: Card[];
  discardPile: Card[];
  /** Completed sequences in play order. */
  sequences: Sequence[];
  /** Chip positions already counted in a sequence; "r,c" keys. */
  lockedChips: Set<string>;
  winner: Team | null;
  /** Becomes true the moment a discardDead is consumed this turn (only one allowed per turn). */
  discardedThisTurn: boolean;
}

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string };

import { cardKey } from "./cards.js";
import type { BoardSquare, Pos, Rank, Suit } from "./types.js";

export const BOARD_SIZE = 10;

/**
 * The canonical Jax Ltd. Sequence board, transcribed row-major from the
 * official board art. Each cell is either "F" (free corner) or a two-character
 * card code: <rank><suit> where rank ∈ {2-9,T,Q,K,A} (no Jacks) and suit
 * ∈ {S,H,D,C}. Each non-Jack card appears exactly twice across the grid.
 */
const OFFICIAL_LAYOUT: string[][] = [
  ["F",  "AC", "KC", "QC", "TC", "9C", "8C", "7C", "6C", "F" ],
  ["AD", "7S", "8S", "9S", "TS", "QS", "KS", "AS", "5C", "2S"],
  ["KD", "6S", "TC", "9C", "8C", "7C", "6C", "2D", "4C", "3S"],
  ["QD", "5S", "QC", "8H", "7H", "6H", "5C", "3D", "3C", "4S"],
  ["TD", "4S", "KC", "9H", "2H", "5H", "4C", "4D", "2C", "5S"],
  ["9D", "3S", "AC", "TH", "3H", "4H", "3C", "5D", "AH", "6S"],
  ["8D", "2S", "AD", "QH", "KH", "AH", "2C", "6D", "KH", "7S"],
  ["7D", "2H", "KD", "QD", "TD", "9D", "8D", "7D", "QH", "8S"],
  ["6D", "3H", "4H", "5H", "6H", "7H", "8H", "9H", "TH", "9S"],
  ["F",  "5D", "4D", "3D", "2D", "AS", "KS", "QS", "TS", "F" ],
];

function parseCell(code: string): BoardSquare {
  if (code === "F") return { kind: "corner" };
  const rank = code[0] as Rank;
  const suit = code[1] as Suit;
  return { kind: "card", rank, suit };
}

/** Mirror a square 2D grid across its top-left-to-bottom-right diagonal. */
function transpose<T>(grid: T[][]): T[][] {
  const n = grid.length;
  const out: T[][] = Array.from({ length: n }, () => new Array<T>(n));
  for (let r = 0; r < n; r++) {
    const row = grid[r]!;
    for (let c = 0; c < n; c++) {
      out[c]![r] = row[c]!;
    }
  }
  return out;
}

/**
 * Return the Sequence board to render. The OFFICIAL_LAYOUT above is preserved
 * as the canonical Jax Ltd. transcription; we transpose it on read so the
 * diamonds run along the top of the rendered board instead of the left edge.
 * Game mechanics (each non-Jack appears exactly twice, corners are free) are
 * invariant under transpose, so the engine + tests are unaffected.
 *
 * To revert to the un-transposed layout: replace `transpose(OFFICIAL_LAYOUT)`
 * with `OFFICIAL_LAYOUT` on the line below.
 */
export function getOfficialBoard(): BoardSquare[][] {
  return transpose(OFFICIAL_LAYOUT).map((row) => row.map(parseCell));
}

/**
 * Backwards-compat alias accepting (and ignoring) a seed argument.
 * The board layout is now fixed; only the deck shuffle uses the seed.
 */
export function generateBoard(_seed?: number): BoardSquare[][] {
  return getOfficialBoard();
}

/** Find every board position matching a given (rank, suit). */
export function findCardPositions(
  board: BoardSquare[][],
  rank: Rank,
  suit: Suit,
): Pos[] {
  const out: Pos[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row = board[r]!;
    for (let c = 0; c < BOARD_SIZE; c++) {
      const sq = row[c]!;
      if (sq.kind === "card" && sq.rank === rank && sq.suit === suit) {
        out.push({ r, c });
      }
    }
  }
  return out;
}

/** Pre-built lookup from "RANK+SUIT" key to positions. */
export function buildCardIndex(board: BoardSquare[][]): Map<string, Pos[]> {
  const idx = new Map<string, Pos[]>();
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row = board[r]!;
    for (let c = 0; c < BOARD_SIZE; c++) {
      const sq = row[c]!;
      if (sq.kind === "card") {
        const k = cardKey(sq.rank, sq.suit);
        const list = idx.get(k);
        if (list) list.push({ r, c });
        else idx.set(k, [{ r, c }]);
      }
    }
  }
  return idx;
}

function isCorner(r: number, c: number): boolean {
  return (
    (r === 0 && c === 0) ||
    (r === 0 && c === BOARD_SIZE - 1) ||
    (r === BOARD_SIZE - 1 && c === 0) ||
    (r === BOARD_SIZE - 1 && c === BOARD_SIZE - 1)
  );
}

export function isCornerPos(pos: Pos): boolean {
  return isCorner(pos.r, pos.c);
}

export function posKey(pos: Pos): string {
  return `${pos.r},${pos.c}`;
}

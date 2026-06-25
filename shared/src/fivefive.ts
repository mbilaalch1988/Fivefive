import { BOARD_SIZE, isCornerPos, posKey } from "./board.js";
import type { Chip, Pos, Fivefive, Team } from "./types.js";

const DIRECTIONS: readonly [number, number][] = [
  [0, 1],   // horizontal
  [1, 0],   // vertical
  [1, 1],   // diagonal down-right
  [1, -1],  // diagonal down-left
];

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

/**
 * A square counts toward a team's fivefive if it is a corner (wild for everyone)
 * or holds that team's chip.
 */
function countsFor(team: Team, chips: Chip[][], r: number, c: number): boolean {
  if (isCornerPos({ r, c })) return true;
  return chips[r]![c] === team;
}

/**
 * Detect any 5-in-a-row fivefives that include the just-placed chip at `placed`.
 *
 * Rules implemented:
 *  - Lines in 4 orientations (H, V, both diagonals).
 *  - Corners are wild — they count for any team and don't consume a chip.
 *  - "One shared chip" rule: at most one chip in the candidate 5-run may already
 *    be locked into a previously-counted fivefive (corners are never locked).
 *  - One placement can complete at most one fivefive per orientation, but may
 *    legitimately complete fivefives in multiple orientations at once.
 */
export function detectFivefives(
  chips: Chip[][],
  placed: Pos,
  team: Team,
  lockedChips: ReadonlySet<string>,
): Fivefive[] {
  const found: Fivefive[] = [];

  for (const [dr, dc] of DIRECTIONS) {
    // Walk both ways from placed along this direction to find every contiguous
    // square that counts for this team.
    const line: Pos[] = [placed];

    // forward
    let r = placed.r + dr, c = placed.c + dc;
    while (inBounds(r, c) && countsFor(team, chips, r, c)) {
      line.push({ r, c });
      r += dr; c += dc;
    }
    // backward
    r = placed.r - dr; c = placed.c - dc;
    while (inBounds(r, c) && countsFor(team, chips, r, c)) {
      line.unshift({ r, c });
      r -= dr; c -= dc;
    }

    if (line.length < 5) continue;

    // The line may be longer than 5; find a 5-window that includes the placed
    // position and respects the "one shared chip" rule. Prefer the window with
    // the placed chip nearer the center (arbitrary tiebreak).
    const placedIdx = line.findIndex((p) => p.r === placed.r && p.c === placed.c);

    let best: Pos[] | null = null;
    for (
      let start = Math.max(0, placedIdx - 4);
      start <= Math.min(line.length - 5, placedIdx);
      start++
    ) {
      const window = line.slice(start, start + 5);

      let lockedCount = 0;
      for (const p of window) {
        if (isCornerPos(p)) continue; // corner is wild and unlocked
        if (lockedChips.has(posKey(p))) lockedCount++;
      }
      if (lockedCount <= 1) {
        best = window;
        break; // first valid is fine; fivefives in same orientation are equivalent
      }
    }

    if (best) {
      found.push({ team, positions: best });
    }
  }

  return found;
}

/** Add new fivefive chips (excluding corners) to the locked set. */
export function lockFivefiveChips(
  lockedChips: Set<string>,
  seq: Fivefive,
): void {
  for (const p of seq.positions) {
    if (!isCornerPos(p)) lockedChips.add(posKey(p));
  }
}

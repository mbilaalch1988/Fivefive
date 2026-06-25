/**
 * Replay-state reconstruction. Given the official board and a list of
 * persisted actions, build the board chip state at any point in the game.
 *
 * This is a SIMPLIFIED view-only re-application — it doesn't track hands,
 * draw pile, discard pile, or per-player stats. Only the chip/fivefive
 * state needed to render the Board.
 */

import { detectFivefives, lockFivefiveChips } from "./fivefive.js";
import { posKey } from "./board.js";
import type { BoardSquare, Chip, Fivefive, Team } from "./types.js";
import type { ReplayAction } from "./protocol.js";

export interface ReplayBoardState {
  chips: Chip[][];
  fivefives: Fivefive[];
  lockedChips: Set<string>;
  /** Per-team fivefive counts at this point in the replay. */
  teamFivefiveCounts: Record<Team, number>;
  /** Last action applied (for highlight/UI), null when stepIndex === 0. */
  lastAction: ReplayAction | null;
}

/** Fresh empty chip grid matching the given board dimensions. */
function emptyChips(board: BoardSquare[][]): Chip[][] {
  return board.map((row) => row.map(() => null));
}

/**
 * Reconstruct the chip state by replaying actions [0, stepIndex).
 *
 * stepIndex = 0   → empty board
 * stepIndex = N   → state after applying the first N actions
 */
export function replayBoardAt(
  board: BoardSquare[][],
  actions: ReplayAction[],
  stepIndex: number,
): ReplayBoardState {
  const clamped = Math.max(0, Math.min(actions.length, stepIndex));
  const chips = emptyChips(board);
  const fivefives: Fivefive[] = [];
  const lockedChips = new Set<string>();
  const teamFivefiveCounts: Record<Team, number> = { red: 0, blue: 0, green: 0 };

  let lastAction: ReplayAction | null = null;

  for (let i = 0; i < clamped; i++) {
    const a = actions[i]!;
    lastAction = a;
    if (a.type === "place" && a.pos) {
      chips[a.pos.r]![a.pos.c] = a.team;
      const newSeqs = detectFivefives(chips, a.pos, a.team, lockedChips);
      for (const seq of newSeqs) {
        fivefives.push(seq);
        lockFivefiveChips(lockedChips, seq);
        teamFivefiveCounts[seq.team] += 1;
      }
    } else if (a.type === "remove" && a.pos) {
      // Only allowed on unlocked chips (server enforced); replay just clears.
      if (!lockedChips.has(posKey(a.pos))) {
        chips[a.pos.r]![a.pos.c] = null;
      }
    }
    // discardDead has no board effect.
  }

  return { chips, fivefives, lockedChips, teamFivefiveCounts, lastAction };
}

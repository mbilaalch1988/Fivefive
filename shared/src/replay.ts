/**
 * Replay-state reconstruction. Given the official board and a list of
 * persisted actions, build the board chip state at any point in the game.
 *
 * This is a SIMPLIFIED view-only re-application — it doesn't track hands,
 * draw pile, discard pile, or per-player stats. Only the chip/sequence
 * state needed to render the Board.
 */

import { detectSequences, lockSequenceChips } from "./sequence.js";
import { posKey } from "./board.js";
import type { BoardSquare, Chip, Sequence, Team } from "./types.js";
import type { ReplayAction } from "./protocol.js";

export interface ReplayBoardState {
  chips: Chip[][];
  sequences: Sequence[];
  lockedChips: Set<string>;
  /** Per-team sequence counts at this point in the replay. */
  teamSequenceCounts: Record<Team, number>;
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
  const sequences: Sequence[] = [];
  const lockedChips = new Set<string>();
  const teamSequenceCounts: Record<Team, number> = { red: 0, blue: 0, green: 0 };

  let lastAction: ReplayAction | null = null;

  for (let i = 0; i < clamped; i++) {
    const a = actions[i]!;
    lastAction = a;
    if (a.type === "place" && a.pos) {
      chips[a.pos.r]![a.pos.c] = a.team;
      const newSeqs = detectSequences(chips, a.pos, a.team, lockedChips);
      for (const seq of newSeqs) {
        sequences.push(seq);
        lockSequenceChips(lockedChips, seq);
        teamSequenceCounts[seq.team] += 1;
      }
    } else if (a.type === "remove" && a.pos) {
      // Only allowed on unlocked chips (server enforced); replay just clears.
      if (!lockedChips.has(posKey(a.pos))) {
        chips[a.pos.r]![a.pos.c] = null;
      }
    }
    // discardDead has no board effect.
  }

  return { chips, sequences, lockedChips, teamSequenceCounts, lastAction };
}

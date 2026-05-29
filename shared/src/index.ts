export const SHARED_VERSION = "0.1.0";

export * from "./types.js";
export * from "./cards.js";
export {
  BOARD_SIZE,
  generateBoard,
  getOfficialBoard,
  findCardPositions,
  buildCardIndex,
  isCornerPos,
  posKey,
} from "./board.js";
export { detectSequences, lockSequenceChips } from "./sequence.js";
export {
  createInitialState,
  currentPlayer,
  defaultHandSize,
  defaultSequencesToWin,
} from "./state.js";
export type { SeatInput } from "./state.js";
export { applyAction } from "./rules.js";
export { mulberry32, shuffle } from "./rng.js";
export * from "./protocol.js";
export { toGameView } from "./view.js";

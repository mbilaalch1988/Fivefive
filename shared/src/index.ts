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
export { detectFivefives, lockFivefiveChips } from "./fivefive.js";
export {
  createInitialState,
  currentPlayer,
  defaultHandSize,
  defaultFivefivesToWin,
} from "./state.js";
export type { SeatInput } from "./state.js";
export { applyAction, pickRandomLegalAction } from "./rules.js";
export { mulberry32, shuffle } from "./rng.js";
export * from "./protocol.js";
export { toGameView } from "./view.js";
export * from "./stickers.js";
export * from "./quickchat.js";
export * from "./achievements.js";
export * from "./replay.js";
export * from "./faizi.js";

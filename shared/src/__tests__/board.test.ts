import { describe, it, expect } from "vitest";
import { BOARD_SIZE, generateBoard, buildCardIndex } from "../board.js";

describe("board", () => {
  it("has 4 corners and 96 card squares", () => {
    const board = generateBoard(42);
    let corners = 0, cards = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const sq = board[r]![c]!;
        if (sq.kind === "corner") corners++;
        else cards++;
      }
    }
    expect(corners).toBe(4);
    expect(cards).toBe(96);
  });

  it("places each non-Jack card exactly twice", () => {
    const board = generateBoard(123);
    const idx = buildCardIndex(board);
    expect(idx.size).toBe(48); // 12 non-Jack ranks × 4 suits
    for (const positions of idx.values()) {
      expect(positions).toHaveLength(2);
    }
  });

  it("contains no Jacks on the board", () => {
    const board = generateBoard(7);
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const sq = board[r]![c]!;
        if (sq.kind === "card") expect(sq.rank).not.toBe("J");
      }
    }
  });

  it("is deterministic for a given seed", () => {
    const a = generateBoard(999);
    const b = generateBoard(999);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

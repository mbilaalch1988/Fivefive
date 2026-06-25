import { describe, it, expect } from "vitest";
import { BOARD_SIZE } from "../board.js";
import { detectFivefives } from "../fivefive.js";
import type { Chip, Team } from "../types.js";

function emptyChips(): Chip[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    new Array<Chip>(BOARD_SIZE).fill(null),
  );
}

describe("detectFivefives", () => {
  const RED: Team = "red";

  it("detects a horizontal 5-in-a-row", () => {
    const chips = emptyChips();
    // place red chips at (3, 2..6)
    for (let c = 2; c <= 6; c++) chips[3]![c] = RED;
    const seqs = detectFivefives(chips, { r: 3, c: 6 }, RED, new Set());
    expect(seqs).toHaveLength(1);
    expect(seqs[0]!.positions).toHaveLength(5);
    expect(seqs[0]!.team).toBe(RED);
  });

  it("detects a vertical 5-in-a-row", () => {
    const chips = emptyChips();
    for (let r = 1; r <= 5; r++) chips[r]![4] = RED;
    const seqs = detectFivefives(chips, { r: 5, c: 4 }, RED, new Set());
    expect(seqs).toHaveLength(1);
  });

  it("detects a diagonal 5-in-a-row", () => {
    const chips = emptyChips();
    for (let i = 0; i < 5; i++) chips[2 + i]![3 + i] = RED;
    const seqs = detectFivefives(chips, { r: 4, c: 5 }, RED, new Set());
    expect(seqs).toHaveLength(1);
  });

  it("does NOT detect with only 4 chips", () => {
    const chips = emptyChips();
    for (let c = 2; c <= 5; c++) chips[3]![c] = RED;
    const seqs = detectFivefives(chips, { r: 3, c: 5 }, RED, new Set());
    expect(seqs).toHaveLength(0);
  });

  it("treats corners as wild for fivefive formation", () => {
    const chips = emptyChips();
    // top-left corner is (0,0); make a row of 4 reds plus the corner
    for (let c = 1; c <= 4; c++) chips[0]![c] = RED;
    const seqs = detectFivefives(chips, { r: 0, c: 4 }, RED, new Set());
    expect(seqs).toHaveLength(1);
    // the fivefive should contain the corner
    const hasCorner = seqs[0]!.positions.some((p) => p.r === 0 && p.c === 0);
    expect(hasCorner).toBe(true);
  });

  it("permits at most one chip shared with a previous fivefive", () => {
    const chips = emptyChips();
    // First fivefive: (3,2..6). Lock chips at columns 2..6.
    for (let c = 2; c <= 6; c++) chips[3]![c] = RED;
    const locked = new Set<string>();
    for (let c = 2; c <= 6; c++) locked.add(`3,${c}`);

    // Try to form a second horizontal fivefive sharing TWO chips (3,5) and (3,6):
    // we'd need (3,5),(3,6),(3,7),(3,8),(3,9) — already chips 5,6 are red.
    // Place chips at 7,8,9 and check the placement at 9.
    chips[3]![7] = RED;
    chips[3]![8] = RED;
    chips[3]![9] = RED;
    const seqs = detectFivefives(chips, { r: 3, c: 9 }, RED, locked);
    expect(seqs).toHaveLength(0); // 2 locked chips in the window → invalid
  });

  it("allows exactly one shared chip with a previous fivefive", () => {
    const chips = emptyChips();
    // First fivefive row 3 cols 1..5
    for (let c = 1; c <= 5; c++) chips[3]![c] = RED;
    const locked = new Set<string>();
    for (let c = 1; c <= 5; c++) locked.add(`3,${c}`);

    // Build vertical fivefive sharing only (3,5): place (1,5),(2,5),(4,5),(5,5)
    chips[1]![5] = RED;
    chips[2]![5] = RED;
    chips[4]![5] = RED;
    const seqs = detectFivefives(chips, { r: 5, c: 5 }, RED, locked);
    // need a 5th: place (5,5) — but that's the trigger; we need 5 consecutive.
    chips[5]![5] = RED;
    const seqs2 = detectFivefives(chips, { r: 5, c: 5 }, RED, locked);
    expect(seqs2).toHaveLength(1);
  });

  it("can complete fivefives in two orientations on one placement", () => {
    const chips = emptyChips();
    // Build a horizontal of 4 and a vertical of 4 meeting at (5,5).
    // Horizontal: (5,1..4) red; vertical: (1..4,5) red. Place (5,5) → completes both.
    for (let c = 1; c <= 4; c++) chips[5]![c] = "red";
    for (let r = 1; r <= 4; r++) chips[r]![5] = "red";
    chips[5]![5] = "red";
    const seqs = detectFivefives(chips, { r: 5, c: 5 }, "red", new Set());
    expect(seqs).toHaveLength(2);
  });
});

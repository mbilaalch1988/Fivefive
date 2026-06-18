import { describe, it, expect } from "vitest";
import { createInitialState } from "../state.js";
import { applyAction } from "../rules.js";
import { buildCardIndex } from "../board.js";
import { cardKey } from "../cards.js";
import type { Card, GameState, Pos, Team } from "../types.js";

function setup(seed = 1234): GameState {
  return createInitialState(
    [
      { id: "p1", name: "Alice", team: "red" as Team },
      { id: "p2", name: "Bob", team: "blue" as Team },
    ],
    { seed, sequencesToWin: 2 },
  );
}

/** Give a player a card with full control over what they hold. */
function giveCard(state: GameState, playerIdx: number, card: Card) {
  state.players[playerIdx]!.hand.push(card);
}

/** Find the first hand card whose matching board square is empty. Returns the card and one such pos. */
function findPlayableNonJack(
  state: GameState,
  playerIdx: number,
): { card: Card; pos: Pos } | null {
  const idx = buildCardIndex(state.board);
  for (const card of state.players[playerIdx]!.hand) {
    if (card.rank === "J") continue;
    const positions = idx.get(cardKey(card.rank, card.suit)) ?? [];
    for (const p of positions) {
      if (state.chips[p.r]![p.c] === null) return { card, pos: p };
    }
  }
  return null;
}

describe("setup", () => {
  it("deals 6 cards to each of 2 players", () => {
    const s = setup();
    expect(s.players[0]!.hand).toHaveLength(6);
    expect(s.players[1]!.hand).toHaveLength(6);
  });

  it("draw pile holds the remaining 92 cards (104 - 12 dealt)", () => {
    const s = setup();
    expect(s.drawPile).toHaveLength(104 - 12);
  });
});

describe("applyAction: place", () => {
  it("places a chip on the matching square and draws a replacement", () => {
    const s = setup();
    const playable = findPlayableNonJack(s, 0)!;
    expect(playable).not.toBeNull();
    const handBefore = s.players[0]!.hand.length;
    const drawBefore = s.drawPile.length;

    const result = applyAction(s, "p1", {
      type: "place",
      cardId: playable.card.id,
      pos: playable.pos,
    });

    expect(result.ok).toBe(true);
    expect(s.chips[playable.pos.r]![playable.pos.c]).toBe("red");
    expect(s.players[0]!.hand).toHaveLength(handBefore); // played one, drew one
    expect(s.drawPile).toHaveLength(drawBefore - 1);
    expect(s.turnIdx).toBe(1);
  });

  it("rejects placing on a mismatched square", () => {
    const s = setup();
    const card = s.players[0]!.hand.find((c) => c.rank !== "J")!;
    // Pick a position that does not match the card.
    let pos: Pos | null = null;
    outer: for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const sq = s.board[r]![c]!;
        if (sq.kind === "card" && (sq.rank !== card.rank || sq.suit !== card.suit)) {
          pos = { r, c };
          break outer;
        }
      }
    }
    const result = applyAction(s, "p1", { type: "place", cardId: card.id, pos: pos! });
    expect(result.ok).toBe(false);
  });

  it("rejects out-of-turn play", () => {
    const s = setup();
    const playable = findPlayableNonJack(s, 1);
    if (!playable) return;
    const result = applyAction(s, "p2", {
      type: "place",
      cardId: playable.card.id,
      pos: playable.pos,
    });
    expect(result.ok).toBe(false);
  });
});

describe("applyAction: two-eyed Jack (wild)", () => {
  it("places on any empty square", () => {
    const s = setup();
    const wild: Card = { id: 9999, rank: "J", suit: "D" }; // two-eyed
    giveCard(s, 0, wild);
    // Pick the first non-corner empty square.
    let target: Pos | null = null;
    outer: for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const sq = s.board[r]![c]!;
        if (sq.kind === "card") { target = { r, c }; break outer; }
      }
    }
    const result = applyAction(s, "p1", {
      type: "place",
      cardId: wild.id,
      pos: target!,
    });
    expect(result.ok).toBe(true);
    expect(s.chips[target!.r]![target!.c]).toBe("red");
  });
});

describe("applyAction: one-eyed Jack (remove)", () => {
  it("removes an opponent's chip", () => {
    const s = setup();
    // Drop a blue chip somewhere directly.
    s.chips[5]![5] = "blue";
    const remover: Card = { id: 8888, rank: "J", suit: "S" }; // one-eyed
    giveCard(s, 0, remover);

    const result = applyAction(s, "p1", {
      type: "remove",
      cardId: remover.id,
      pos: { r: 5, c: 5 },
    });
    expect(result.ok).toBe(true);
    expect(s.chips[5]![5]).toBeNull();
  });

  it("refuses to remove a chip locked in a sequence", () => {
    const s = setup();
    s.chips[5]![5] = "blue";
    s.lockedChips.add("5,5");
    const remover: Card = { id: 8888, rank: "J", suit: "S" };
    giveCard(s, 0, remover);

    const result = applyAction(s, "p1", {
      type: "remove",
      cardId: remover.id,
      pos: { r: 5, c: 5 },
    });
    expect(result.ok).toBe(false);
    expect(s.chips[5]![5]).toBe("blue");
  });

  it("refuses to remove your own chip", () => {
    const s = setup();
    s.chips[5]![5] = "red";
    const remover: Card = { id: 8888, rank: "J", suit: "S" };
    giveCard(s, 0, remover);

    const result = applyAction(s, "p1", {
      type: "remove",
      cardId: remover.id,
      pos: { r: 5, c: 5 },
    });
    expect(result.ok).toBe(false);
  });
});

describe("applyAction: discard dead card", () => {
  it("permits discarding when both matching squares are occupied", () => {
    const s = setup();
    const card = s.players[0]!.hand.find((c) => c.rank !== "J")!;
    const idx = buildCardIndex(s.board);
    const positions = idx.get(cardKey(card.rank, card.suit))!;
    // Occupy both matching positions.
    for (const p of positions) s.chips[p.r]![p.c] = "blue";

    const result = applyAction(s, "p1", { type: "discardDead", cardId: card.id });
    expect(result.ok).toBe(true);
    // Should NOT have ended the turn; player still owes a play.
    expect(s.turnIdx).toBe(0);
    expect(s.discardedThisTurn).toBe(true);
  });

  it("rejects discarding a non-dead card", () => {
    const s = setup();
    const card = s.players[0]!.hand.find((c) => c.rank !== "J")!;
    const result = applyAction(s, "p1", { type: "discardDead", cardId: card.id });
    expect(result.ok).toBe(false);
  });

  it("rejects discarding a Jack", () => {
    const s = setup();
    const jack: Card = { id: 7777, rank: "J", suit: "C" };
    giveCard(s, 0, jack);
    const result = applyAction(s, "p1", { type: "discardDead", cardId: jack.id });
    expect(result.ok).toBe(false);
  });
});

describe("win condition", () => {
  it("declares a winner when a team reaches sequencesToWin", () => {
    const s = setup();
    s.config.sequencesToWin = 1;
    // Force red chips into a horizontal 5-in-a-row on row 5 cols 1..5,
    // leaving (5,5) empty so we trigger detection via a wild placement.
    for (let c = 1; c <= 4; c++) s.chips[5]![c] = "red";
    const wild: Card = { id: 6666, rank: "J", suit: "C" };
    giveCard(s, 0, wild);

    const result = applyAction(s, "p1", {
      type: "place",
      cardId: wild.id,
      pos: { r: 5, c: 5 },
    });
    expect(result.ok).toBe(true);
    expect(s.winner).toBe("red");
    // Once winner is declared, further actions are rejected.
    const next = applyAction(s, "p2", { type: "place", cardId: 0, pos: { r: 0, c: 1 } });
    expect(next.ok).toBe(false);
  });
});

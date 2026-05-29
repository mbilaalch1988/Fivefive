import { describe, it, expect } from "vitest";
import { createDeck, isOneEyedJack, isTwoEyedJack, isJack } from "../cards.js";

describe("deck", () => {
  it("has 104 cards with unique ids", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(104);
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(104);
  });

  it("contains 8 Jacks: 4 one-eyed + 4 two-eyed", () => {
    const deck = createDeck();
    const jacks = deck.filter(isJack);
    expect(jacks).toHaveLength(8);
    expect(jacks.filter(isOneEyedJack)).toHaveLength(4); // 2 (S,H) × 2 decks
    expect(jacks.filter(isTwoEyedJack)).toHaveLength(4); // 2 (D,C) × 2 decks
  });

  it("contains exactly 2 of every (rank,suit) combination", () => {
    const deck = createDeck();
    const counts = new Map<string, number>();
    for (const c of deck) {
      const k = `${c.rank}${c.suit}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.size).toBe(52);
    for (const n of counts.values()) expect(n).toBe(2);
  });
});

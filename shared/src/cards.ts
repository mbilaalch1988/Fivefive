import type { Card, Rank, Suit } from "./types.js";

export const ALL_SUITS: readonly Suit[] = ["S", "H", "D", "C"] as const;
export const ALL_RANKS: readonly Rank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A",
] as const;

export const NON_JACK_RANKS: readonly Rank[] = ALL_RANKS.filter(
  (r) => r !== "J",
);

export function isJack(card: Pick<Card, "rank">): boolean {
  return card.rank === "J";
}

/** One-eyed Jacks (Spades, Hearts) — remove an opponent's chip. */
export function isOneEyedJack(card: Pick<Card, "rank" | "suit">): boolean {
  return card.rank === "J" && (card.suit === "S" || card.suit === "H");
}

/** Two-eyed Jacks (Diamonds, Clubs) — wild, place anywhere. */
export function isTwoEyedJack(card: Pick<Card, "rank" | "suit">): boolean {
  return card.rank === "J" && (card.suit === "D" || card.suit === "C");
}

/** Build a 104-card deck (two standard decks). Each card has a unique id 0..103. */
export function createDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;
  for (let copy = 0; copy < 2; copy++) {
    for (const suit of ALL_SUITS) {
      for (const rank of ALL_RANKS) {
        cards.push({ id: id++, rank, suit });
      }
    }
  }
  return cards;
}

export function cardKey(rank: Rank, suit: Suit): string {
  return `${rank}${suit}`;
}

export function cardLabel(card: Card): string {
  return cardKey(card.rank, card.suit);
}

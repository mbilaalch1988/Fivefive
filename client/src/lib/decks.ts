import type { DeckManifest, Rank, Suit } from "@fivefive/shared";

/** Base URL for assets served by the Node server. Empty string = same origin. */
const ASSET_BASE =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? "http://localhost:3001" : "");

export function cardImageUrl(
  deck: DeckManifest,
  rank: Rank,
  suit: Suit,
): string | null {
  const rel = deck.cards[`${rank}${suit}`];
  return rel ? `${ASSET_BASE}/decks/${deck.id}/${rel}` : null;
}

export function backImageUrl(deck: DeckManifest): string {
  return `${ASSET_BASE}/decks/${deck.id}/${deck.back}`;
}

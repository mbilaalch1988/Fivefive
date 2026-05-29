import type { Card, Rank, Suit, Team } from "@sequence/shared";

export const SUIT_SYMBOL: Record<Suit, string> = {
  S: "♠", // ♠
  H: "♥", // ♥
  D: "♦", // ♦
  C: "♣", // ♣
};

export const SUIT_COLOR: Record<Suit, string> = {
  S: "text-slate-900",
  H: "text-red-600",
  D: "text-red-600",
  C: "text-slate-900",
};

export const RANK_DISPLAY: Record<Rank, string> = {
  "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
  T: "10", J: "J", Q: "Q", K: "K", A: "A",
};

export const TEAM_CHIP: Record<Team, string> = {
  red: "bg-red-500 border-red-700",
  blue: "bg-blue-500 border-blue-700",
  green: "bg-emerald-500 border-emerald-700",
};

export const TEAM_RING: Record<Team, string> = {
  red: "ring-red-400",
  blue: "ring-blue-400",
  green: "ring-emerald-400",
};

export const TEAM_LABEL: Record<Team, string> = {
  red: "Red",
  blue: "Blue",
  green: "Green",
};

export function cardLabel(card: Card): string {
  return `${RANK_DISPLAY[card.rank]}${SUIT_SYMBOL[card.suit]}`;
}

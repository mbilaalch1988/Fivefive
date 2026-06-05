import type { Card, Rank, Suit, Team } from "@sequence/shared";

export const SUIT_SYMBOL: Record<Suit, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};

export const SUIT_COLOR: Record<Suit, string> = {
  S: "text-zinc-900",
  H: "text-rose-600",
  D: "text-rose-600",
  C: "text-zinc-900",
};

export const RANK_DISPLAY: Record<Rank, string> = {
  "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
  T: "10", J: "J", Q: "Q", K: "K", A: "A",
};

/** Team chip flat fill colors (cartoon style). */
export const TEAM_CHIP: Record<Team, string> = {
  red: "bg-rose-500",
  blue: "bg-sky-500",
  green: "bg-emerald-500",
};

/** Soft, low-saturation surface for team-tinted containers (Material tonal). */
export const TEAM_SURFACE: Record<Team, string> = {
  red: "bg-rose-500/15 border-rose-400/40",
  blue: "bg-sky-500/15 border-sky-400/40",
  green: "bg-emerald-500/15 border-emerald-400/40",
};

export const TEAM_TEXT: Record<Team, string> = {
  red: "text-rose-300",
  blue: "text-sky-300",
  green: "text-emerald-300",
};

export const DEFAULT_TEAM_LABEL: Record<Team, string> = {
  red: "Red",
  blue: "Blue",
  green: "Green",
};

export function cardLabel(card: Card): string {
  return `${RANK_DISPLAY[card.rank]}${SUIT_SYMBOL[card.suit]}`;
}

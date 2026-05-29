import type { Card, DeckManifest } from "@sequence/shared";
import { RANK_DISPLAY, SUIT_COLOR, SUIT_SYMBOL } from "../lib/cards";
import { cardImageUrl } from "../lib/decks";

interface Props {
  card: Card;
  size?: "sm" | "md" | "lg" | "responsive";
  faded?: boolean;
  deck?: DeckManifest | null;
}

const SIZE_CLASSES: Record<NonNullable<Props["size"]>, string> = {
  sm: "w-10 h-14 text-xs",
  md: "w-14 h-20 text-sm",
  lg: "w-16 h-24 text-base",
  responsive: "w-10 h-14 text-[0.65rem] sm:w-14 sm:h-20 sm:text-sm",
};

const RANK_TEXT: Record<NonNullable<Props["size"]>, string> = {
  sm: "text-[0.55rem]",
  md: "text-[0.7rem]",
  lg: "text-xs",
  responsive: "text-[0.55rem] sm:text-[0.7rem]",
};

const CENTER_TEXT: Record<NonNullable<Props["size"]>, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
  responsive: "text-lg sm:text-2xl",
};

export function CardFace({ card, size = "md", faded = false, deck }: Props) {
  const fadedClass = faded ? "opacity-40" : "";

  // Image rendering when a deck is provided.
  if (deck) {
    const url = cardImageUrl(deck, card.rank, card.suit);
    if (url) {
      return (
        <div
          className={`relative bg-white border border-slate-300 rounded overflow-hidden ${SIZE_CLASSES[size]} ${fadedClass}`}
        >
          <img
            src={url}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
      );
    }
  }

  // CSS fallback
  const color = SUIT_COLOR[card.suit];
  const rank = RANK_DISPLAY[card.rank];
  const suit = SUIT_SYMBOL[card.suit];
  return (
    <div
      className={`relative bg-white border border-slate-300 rounded ${SIZE_CLASSES[size]} ${fadedClass}`}
    >
      <div
        className={`absolute top-0.5 left-1 leading-none ${color} font-semibold ${RANK_TEXT[size]}`}
      >
        <div>{rank}</div>
        <div>{suit}</div>
      </div>
      <div
        className={`absolute inset-0 flex items-center justify-center ${color} ${CENTER_TEXT[size]}`}
      >
        {suit}
      </div>
      <div
        className={`absolute bottom-0.5 right-1 leading-none ${color} font-semibold rotate-180 ${RANK_TEXT[size]}`}
      >
        <div>{rank}</div>
        <div>{suit}</div>
      </div>
    </div>
  );
}

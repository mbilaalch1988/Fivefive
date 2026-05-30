import type { Card, DeckManifest } from "@sequence/shared";
import { RANK_DISPLAY, SUIT_COLOR, SUIT_SYMBOL } from "../lib/cards";
import { cardImageUrl } from "../lib/decks";

interface Props {
  card: Card;
  size?: "sm" | "md" | "lg" | "responsive";
  faded?: boolean;
  deck?: DeckManifest | null;
}

// Responsive size is now ~30% larger than the original (40x56 → 52x72 mobile,
// 56x80 → 72x104 desktop). Used in Hand and for Last Played.
const SIZE_CLASSES: Record<NonNullable<Props["size"]>, string> = {
  sm: "w-10 h-14 text-xs",
  md: "w-[72px] h-[104px] text-sm",
  lg: "w-20 h-28 text-base",
  responsive: "w-[52px] h-[72px] text-[0.7rem] sm:w-[72px] sm:h-[104px] sm:text-sm",
};

const RANK_TEXT: Record<NonNullable<Props["size"]>, string> = {
  sm: "text-[0.55rem]",
  md: "text-[0.85rem]",
  lg: "text-sm",
  responsive: "text-[0.7rem] sm:text-[0.85rem]",
};

const CENTER_TEXT: Record<NonNullable<Props["size"]>, string> = {
  sm: "text-lg",
  md: "text-3xl",
  lg: "text-4xl",
  responsive: "text-xl sm:text-3xl",
};

export function CardFace({ card, size = "md", faded = false, deck }: Props) {
  const fadedClass = faded ? "opacity-40" : "";

  if (deck) {
    const url = cardImageUrl(deck, card.rank, card.suit);
    if (url) {
      return (
        <div
          className={`relative bg-white border border-slate-300 rounded overflow-hidden shadow-sm ${SIZE_CLASSES[size]} ${fadedClass}`}
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

  const color = SUIT_COLOR[card.suit];
  const rank = RANK_DISPLAY[card.rank];
  const suit = SUIT_SYMBOL[card.suit];
  return (
    <div
      className={`relative bg-white border border-slate-300 rounded shadow-sm ${SIZE_CLASSES[size]} ${fadedClass}`}
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

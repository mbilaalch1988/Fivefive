import type { BoardSquare, Chip, DeckManifest, Team } from "@sequence/shared";
import { RANK_DISPLAY, SUIT_COLOR, SUIT_SYMBOL, TEAM_CHIP } from "../lib/cards";
import { backImageUrl, cardImageUrl } from "../lib/decks";

interface Props {
  square: BoardSquare;
  chip: Chip;
  locked: boolean;
  justLocked: boolean;
  justPlaced: boolean;
  celebrateDelayMs: number | null;
  highlight: "none" | "playable" | "removable";
  deck: DeckManifest | null;
  flipDelayMs: number;
  onClick: () => void;
  testId?: string;
}

export function Square({
  square,
  chip,
  locked,
  justLocked,
  justPlaced,
  celebrateDelayMs,
  highlight,
  deck,
  flipDelayMs,
  onClick,
  testId,
}: Props) {
  // Pulsing glow on selectable cells. Box-shadow is animated via the keyframe
  // — Tailwind ring stays static for crisp edge color.
  const highlightClasses =
    highlight === "playable"
      ? "ring-4 ring-amber-300 playable-pulse z-10"
      : highlight === "removable"
        ? "ring-4 ring-rose-400 removable-pulse z-10"
        : "";

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-highlight={highlight}
      className={`relative aspect-[5/7] w-full rounded-md overflow-hidden bg-zinc-950 ${highlightClasses} ${
        highlight !== "none" ? "cursor-pointer hover:brightness-110" : "cursor-default"
      }`}
      style={{ perspective: "600px" }}
    >
      <div
        className="absolute inset-0 card-flip-in"
        style={{
          transformStyle: "preserve-3d",
          animationDelay: `${flipDelayMs}ms`,
        }}
      >
        <div className="absolute inset-0 card-face">
          <SquareFront square={square} deck={deck} />
        </div>
        <div className="absolute inset-0 card-face card-back-face">
          <SquareBack deck={deck} />
        </div>
      </div>
      {chip && (
        <ChipDisk
          team={chip}
          locked={locked}
          justLocked={justLocked}
          justPlaced={justPlaced}
          celebrateDelayMs={celebrateDelayMs}
        />
      )}
    </button>
  );
}

function SquareFront({
  square,
  deck,
}: {
  square: BoardSquare;
  deck: DeckManifest | null;
}) {
  if (square.kind === "corner") {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-amber-200 text-amber-900 font-bold text-[0.45rem] sm:text-[0.6rem] tracking-widest">
        FREE
      </div>
    );
  }
  if (deck) {
    const url = cardImageUrl(deck, square.rank, square.suit);
    if (url) {
      return (
        <img
          src={url}
          alt=""
          loading="eager"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover bg-white"
        />
      );
    }
  }
  const color = SUIT_COLOR[square.suit];
  return (
    <div className="absolute inset-0 bg-slate-50">
      <div
        className={`absolute top-0 left-0.5 leading-none ${color} text-[0.45rem] sm:text-[0.6rem] font-semibold`}
      >
        <div>{RANK_DISPLAY[square.rank]}</div>
        <div>{SUIT_SYMBOL[square.suit]}</div>
      </div>
      <div
        className={`absolute inset-0 flex items-center justify-center ${color} text-sm sm:text-lg`}
      >
        {SUIT_SYMBOL[square.suit]}
      </div>
    </div>
  );
}

function SquareBack({ deck }: { deck: DeckManifest | null }) {
  // Deck with an explicit back image → use it. Otherwise (no deck OR deck
  // didn't include a back) use the built-in striped fallback pattern.
  if (deck && deck.back) {
    return (
      <img
        src={backImageUrl(deck)}
        alt=""
        loading="eager"
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover"
      />
    );
  }
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          "repeating-linear-gradient(45deg, #1e293b 0 4px, #0f172a 4px 8px)",
      }}
    />
  );
}

function ChipDisk({
  team,
  locked,
  justLocked,
  justPlaced,
  celebrateDelayMs,
}: {
  team: Team;
  locked: boolean;
  justLocked: boolean;
  justPlaced: boolean;
  celebrateDelayMs: number | null;
}) {
  const celebrating = celebrateDelayMs !== null;
  // Animation classes are composable in CSS (.chip-drop.chip-flip chains them
  // so the bounce-in plays first, then the locked-flip).
  const animClasses = [
    justPlaced ? "chip-drop" : "",
    justLocked ? "chip-flip" : "",
    celebrating ? "chip-celebrate" : "",
  ]
    .filter(Boolean)
    .join(" ");
  // Cartoon look: flat solid fill, no inset highlights/gradients. Thick dark
  // outline drawn via a 2.5px ring. A small offset shadow keeps the chip
  // legible against the card art beneath without going 3D.
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div
        data-chip-team={team}
        className={`relative rounded-full flex items-center justify-center cb-chip ${TEAM_CHIP[team]} ${animClasses}`}
        style={{
          width: "56%",
          aspectRatio: "1 / 1",
          border: "2.5px solid #18181b",
          boxShadow: "1px 1.5px 0 #18181b",
          ...(celebrating ? { animationDelay: `${celebrateDelayMs}ms` } : {}),
        }}
      >
        {locked && (
          <svg
            viewBox="0 0 24 24"
            className={`w-3/5 h-3/5 text-yellow-300 ${justLocked ? "crown-reveal" : ""}`}
            fill="currentColor"
            stroke="#18181b"
            strokeWidth="1.5"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 8l3.5 3 2.5-5 3 5 3-5 2.5 5L21 8l-1.6 9H4.6L3 8zm1.7 11h14.6v2H4.7v-2z" />
          </svg>
        )}
      </div>
    </div>
  );
}

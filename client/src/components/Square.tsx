import type { BoardSquare, Chip, DeckManifest, Team } from "@sequence/shared";
import { RANK_DISPLAY, SUIT_COLOR, SUIT_SYMBOL, TEAM_CHIP } from "../lib/cards";
import { backImageUrl, cardImageUrl } from "../lib/decks";

interface Props {
  square: BoardSquare;
  chip: Chip;
  locked: boolean;
  justLocked: boolean;
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
  celebrateDelayMs,
  highlight,
  deck,
  flipDelayMs,
  onClick,
  testId,
}: Props) {
  // Strong, attention-grabbing highlight: thick ring + soft colored glow.
  const highlightClasses =
    highlight === "playable"
      ? "ring-4 ring-amber-300 shadow-[0_0_14px_4px_rgba(252,211,77,0.75)] z-10"
      : highlight === "removable"
        ? "ring-4 ring-rose-400 shadow-[0_0_14px_4px_rgba(251,113,133,0.75)] z-10"
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
  if (deck) {
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
  celebrateDelayMs,
}: {
  team: Team;
  locked: boolean;
  justLocked: boolean;
  celebrateDelayMs: number | null;
}) {
  const celebrating = celebrateDelayMs !== null;
  // Outer wrapper fills the cell so we can flex-center the (much smaller) chip.
  // The chip itself is a perfect circle (aspect-ratio 1) sized as a percent of
  // the cell — so it stays round regardless of cell aspect — with inset
  // highlights (bevel) + outer drop shadow for a 3D feel.
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div
        className={`relative rounded-full flex items-center justify-center ${TEAM_CHIP[team]} ${
          justLocked ? "chip-flip" : ""
        } ${celebrating ? "chip-celebrate" : ""}`}
        style={{
          width: "52%",
          aspectRatio: "1 / 1",
          boxShadow:
            "inset 0 1.5px 3px rgba(255,255,255,0.45), inset 0 -2.5px 4px rgba(0,0,0,0.38), 0 2px 6px rgba(0,0,0,0.55)",
          ...(celebrating ? { animationDelay: `${celebrateDelayMs}ms` } : {}),
        }}
      >
        {locked && (
          <svg
            viewBox="0 0 24 24"
            className={`w-3/5 h-3/5 text-yellow-200 drop-shadow ${justLocked ? "crown-reveal" : ""}`}
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M3 8l3.5 3 2.5-5 3 5 3-5 2.5 5L21 8l-1.6 9H4.6L3 8zm1.7 11h14.6v2H4.7v-2z" />
          </svg>
        )}
      </div>
    </div>
  );
}

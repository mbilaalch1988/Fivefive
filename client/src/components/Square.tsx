import type { BoardSquare, Chip, DeckManifest, Team } from "@sequence/shared";
import { RANK_DISPLAY, SUIT_COLOR, SUIT_SYMBOL, TEAM_CHIP } from "../lib/cards";
import { backImageUrl, cardImageUrl } from "../lib/decks";

interface Props {
  square: BoardSquare;
  chip: Chip;
  locked: boolean;
  justLocked: boolean;
  highlight: "none" | "playable" | "removable";
  deck: DeckManifest | null;
  /** ms before the entry flip starts (used at game start for the wave effect). */
  flipDelayMs: number;
  onClick: () => void;
  testId?: string;
}

export function Square({
  square,
  chip,
  locked,
  justLocked,
  highlight,
  deck,
  flipDelayMs,
  onClick,
  testId,
}: Props) {
  const baseRing =
    highlight === "playable"
      ? "ring-2 ring-amber-300"
      : highlight === "removable"
        ? "ring-2 ring-rose-400"
        : "";

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-highlight={highlight}
      className={`relative aspect-square w-full rounded-sm overflow-hidden bg-slate-900 ${baseRing} ${
        highlight !== "none" ? "cursor-pointer hover:brightness-105" : "cursor-default"
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
      {chip && <ChipDisk team={chip} locked={locked} justLocked={justLocked} />}
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
  // CSS fallback
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
}: {
  team: Team;
  locked: boolean;
  justLocked: boolean;
}) {
  return (
    <div
      className={`absolute inset-0.5 sm:inset-1 rounded-full border-2 ${TEAM_CHIP[team]} flex items-center justify-center shadow-md ${
        justLocked ? "chip-flip" : ""
      } ${locked ? "ring-2 ring-yellow-300 ring-offset-1 ring-offset-slate-50" : ""}`}
    >
      {locked && (
        <svg
          viewBox="0 0 24 24"
          className={`w-3/5 h-3/5 text-yellow-200 drop-shadow ${justLocked ? "crown-reveal" : ""}`}
          fill="currentColor"
          aria-hidden="true"
        >
          {/* Stylized crown */}
          <path d="M3 8l3.5 3 2.5-5 3 5 3-5 2.5 5L21 8l-1.6 9H4.6L3 8zm1.7 11h14.6v2H4.7v-2z" />
        </svg>
      )}
    </div>
  );
}

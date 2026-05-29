import type { BoardSquare, Chip, Team } from "@sequence/shared";
import { RANK_DISPLAY, SUIT_COLOR, SUIT_SYMBOL, TEAM_CHIP } from "../lib/cards";

interface Props {
  square: BoardSquare;
  chip: Chip;
  locked: boolean;
  highlight: "none" | "playable" | "removable";
  onClick: () => void;
  testId?: string;
}

export function Square({ square, chip, locked, highlight, onClick, testId }: Props) {
  const isCorner = square.kind === "corner";

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
      className={`relative aspect-square w-full bg-slate-50 border border-slate-300 rounded-sm overflow-hidden ${baseRing} ${
        highlight !== "none" ? "cursor-pointer hover:brightness-105" : "cursor-default"
      }`}
    >
      {isCorner ? (
        <div className="absolute inset-0 flex items-center justify-center bg-amber-200 text-amber-900 font-bold text-[0.45rem] sm:text-[0.6rem] tracking-widest">
          FREE
        </div>
      ) : (
        <CardSquareContent square={square} />
      )}
      {chip && <ChipDisk team={chip} locked={locked} />}
    </button>
  );
}

function CardSquareContent({ square }: { square: Extract<BoardSquare, { kind: "card" }> }) {
  const color = SUIT_COLOR[square.suit];
  return (
    <>
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
    </>
  );
}

function ChipDisk({ team, locked }: { team: Team; locked: boolean }) {
  return (
    <div
      className={`absolute inset-0.5 sm:inset-1 rounded-full border-2 ${TEAM_CHIP[team]} ${
        locked ? "ring-2 ring-yellow-300 ring-offset-1 ring-offset-slate-50" : ""
      } shadow-md`}
    />
  );
}

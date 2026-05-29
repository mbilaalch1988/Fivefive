import type { GameView, Pos } from "@sequence/shared";
import { Square } from "./Square";

interface Props {
  view: GameView;
  highlight: (pos: Pos) => "none" | "playable" | "removable";
  onSquareClick: (pos: Pos) => void;
}

export function Board({ view, highlight, onSquareClick }: Props) {
  const locked = new Set(view.lockedChips);
  return (
    <div
      className="grid gap-px sm:gap-0.5 bg-slate-700 p-0.5 sm:p-1 rounded-md"
      style={{ gridTemplateColumns: "repeat(10, minmax(0, 1fr))" }}
    >
      {view.board.map((row, r) =>
        row.map((square, c) => {
          const pos: Pos = { r, c };
          const chip = view.chips[r]![c]!;
          return (
            <Square
              key={`${r}-${c}`}
              square={square}
              chip={chip}
              locked={locked.has(`${r},${c}`)}
              highlight={highlight(pos)}
              onClick={() => onSquareClick(pos)}
              testId={`sq-${r}-${c}`}
            />
          );
        }),
      )}
    </div>
  );
}

import type { DeckManifest, GameView, Pos } from "@sequence/shared";
import { Square } from "./Square";

interface Props {
  view: GameView;
  justLocked: ReadonlySet<string>;
  highlight: (pos: Pos) => "none" | "playable" | "removable";
  onSquareClick: (pos: Pos) => void;
}

const FLIP_STAGGER_MS = 25; // per-cell delay along the anti-diagonal

export function Board({ view, justLocked, highlight, onSquareClick }: Props) {
  const locked = new Set(view.lockedChips);
  const deck: DeckManifest | null = view.deck ?? null;
  return (
    <div
      className="grid gap-px sm:gap-0.5 bg-slate-700 p-0.5 sm:p-1 rounded-md"
      style={{ gridTemplateColumns: "repeat(10, minmax(0, 1fr))" }}
    >
      {view.board.map((row, r) =>
        row.map((square, c) => {
          const pos: Pos = { r, c };
          const chip = view.chips[r]![c]!;
          const key = `${r},${c}`;
          return (
            <Square
              key={key}
              square={square}
              chip={chip}
              locked={locked.has(key)}
              justLocked={justLocked.has(key)}
              highlight={highlight(pos)}
              deck={deck}
              flipDelayMs={(r + c) * FLIP_STAGGER_MS}
              onClick={() => onSquareClick(pos)}
              testId={`sq-${r}-${c}`}
            />
          );
        }),
      )}
    </div>
  );
}

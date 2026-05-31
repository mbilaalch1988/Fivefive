import type { DeckManifest, GameView, Pos } from "@sequence/shared";
import { Square } from "./Square";

interface Props {
  view: GameView;
  justLocked: ReadonlySet<string>;
  justPlaced: ReadonlySet<string>;
  celebratingTeam: import("@sequence/shared").Team | null;
  highlight: (pos: Pos) => "none" | "playable" | "removable";
  onSquareClick: (pos: Pos) => void;
}

const FLIP_STAGGER_MS = 60; // per-cell delay along the anti-diagonal

export function Board({
  view,
  justLocked,
  justPlaced,
  celebratingTeam,
  highlight,
  onSquareClick,
}: Props) {
  const locked = new Set(view.lockedChips);
  const deck: DeckManifest | null = view.deck ?? null;

  // Map each celebrating chip position to a staggered glow delay (rises along the chip's sequence path).
  const celebrateDelay = new Map<string, number>();
  if (celebratingTeam) {
    const ordered = view.sequences.filter((s) => s.team === celebratingTeam);
    let i = 0;
    for (const seq of ordered) {
      for (const p of seq.positions) {
        const k = `${p.r},${p.c}`;
        if (!celebrateDelay.has(k)) {
          celebrateDelay.set(k, i * 90);
          i++;
        }
      }
    }
  }

  return (
    <div
      className="grid gap-px sm:gap-0.5 bg-zinc-800 p-1 sm:p-1.5 rounded-2xl shadow-lg shadow-black/40"
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
              justPlaced={justPlaced.has(key)}
              celebrateDelayMs={celebrateDelay.get(key) ?? null}
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

import type { Card, DeckManifest } from "@sequence/shared";
import { CardFace } from "./CardFace";

interface Props {
  hand: Card[];
  selectedCardId: number | null;
  deadCardIds: ReadonlySet<number>;
  disabled: boolean;
  deck: DeckManifest | null;
  onSelect: (cardId: number) => void;
}

export function Hand({ hand, selectedCardId, deadCardIds, disabled, deck, onSelect }: Props) {
  return (
    <div
      className="hand-scroll flex gap-1.5 sm:gap-2 items-end justify-center p-2.5 sm:p-3 rounded-2xl overflow-x-auto"
      style={{ background: "var(--md-surface-1)" }}
    >
      {hand.map((card) => {
        const isSelected = card.id === selectedCardId;
        const isDead = deadCardIds.has(card.id);
        return (
          <button
            key={card.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(card.id)}
            data-testid={`hand-${card.id}`}
            data-selected={isSelected}
            data-dead={isDead}
            className={`transition-transform shrink-0 ${
              isSelected ? "-translate-y-3" : "hover:-translate-y-1"
            } ${disabled ? "cursor-not-allowed" : "cursor-pointer"} ${
              isSelected ? "ring-2 ring-amber-300 rounded-md" : ""
            }`}
            title={isDead ? "dead card" : undefined}
          >
            <CardFace
              card={card}
              size="responsive"
              faded={isDead && !isSelected}
              deck={deck}
            />
          </button>
        );
      })}
    </div>
  );
}

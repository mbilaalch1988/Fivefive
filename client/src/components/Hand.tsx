import type { Card, DeckManifest } from "@fivefive/shared";
import { CardFace } from "./CardFace";

interface Props {
  hand: Card[];
  selectedCardId: number | null;
  deadCardIds: ReadonlySet<number>;
  disabled: boolean;
  deck: DeckManifest | null;
  onSelect: (cardId: number) => void;
}

/**
 * Stacked hand. Each card overlaps the previous so only the top-left
 * corner (rank + suit) shows — like holding a fan of cards. Tap a card
 * to "pop" it out of the stack (translates away from the stack so the
 * full face is visible).
 *
 * Direction switches with orientation:
 *   portrait  → horizontal stack, selected pops UP
 *   landscape → vertical stack, selected pops LEFT
 *
 * The actual stack geometry (overlap amount, pop distance) lives in
 * index.css under `.ff-hand-card`.
 */
export function Hand({ hand, selectedCardId, deadCardIds, disabled, deck, onSelect }: Props) {
  return (
    <div className="ff-hand-cards" data-testid="hand-stack">
      {hand.map((card, i) => {
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
            // z-index keeps later cards visually on top of earlier ones; the
            // selected card jumps to the very top so it isn't clipped by its
            // own neighbors during the pop animation.
            style={{ zIndex: isSelected ? 100 : i + 1 }}
            className={`ff-hand-card ${isSelected ? "ff-hand-card--selected" : ""} ${
              disabled ? "cursor-not-allowed" : "cursor-pointer"
            } ${isSelected ? "ring-2 ring-ff-gold rounded-md" : ""}`}
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

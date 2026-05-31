import type { ActionLog, DeckManifest } from "@sequence/shared";
import { RANK_DISPLAY, SUIT_COLOR, SUIT_SYMBOL } from "../lib/cards";
import { cardImageUrl } from "../lib/decks";
import { makeNickname } from "../lib/nickname";

interface Props {
  actions: ActionLog[];
  deck: DeckManifest | null;
  onClose: () => void;
}

/**
 * Slide-up panel showing the last 5 actions. Most recent first.
 * Jack actions display the Jack card visually "sliced" with the affected
 * board square's card peeking through the cut — so you can see at a glance
 * which square the chip was placed on / removed from.
 */
export function LastPlayedHistory({ actions, deck, onClose }: Props) {
  // Reverse so most recent is on the left.
  const rows = [...actions].reverse();
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center overlay-enter"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-3xl rounded-t-3xl p-4 pb-6 shadow-2xl"
        style={{ background: "var(--md-surface-1)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-medium tracking-tight">Last played</h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="history-close"
            className="state-layer text-zinc-300 hover:text-white text-xs uppercase tracking-widest font-medium px-3 py-1 rounded-full border border-zinc-700"
          >
            Close
          </button>
        </div>
        {rows.length === 0 ? (
          <p
            className="text-sm text-center py-4"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            No actions yet.
          </p>
        ) : (
          <ol className="flex gap-3 overflow-x-auto pb-2">
            {rows.map((a, i) => (
              <li
                key={i}
                className="shrink-0 flex flex-col items-center gap-1"
                style={{ minWidth: "84px" }}
              >
                <HistoryCard action={a} deck={deck} />
                <div className="text-[0.65rem] text-center leading-tight">
                  <div
                    className="font-medium text-zinc-200"
                    title={a.playerName}
                  >
                    {makeNickname(a.playerName)}
                  </div>
                  <div style={{ color: "var(--md-on-surface-variant)" }}>
                    {labelFor(a)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function labelFor(a: ActionLog): string {
  if (a.type === "discardDead") return "discarded (dead)";
  if (a.card.rank === "J") {
    return a.type === "remove" ? "removed chip" : "wild placement";
  }
  return "placed";
}

function HistoryCard({
  action,
  deck,
}: {
  action: ActionLog;
  deck: DeckManifest | null;
}) {
  const isJack = action.card.rank === "J";
  // For Jack actions, also need to know the target square card (where the
  // chip landed / was removed from). Non-Jack place: target equals the
  // played card so there's nothing extra to show.
  const showSlice = isJack && action.targetSquare !== undefined;

  return (
    <div
      className="relative bg-white border border-slate-300 rounded overflow-hidden shadow-sm"
      style={{ width: "72px", height: "100px" }}
    >
      {showSlice && action.targetSquare && (
        <MiniCardArt
          rank={action.targetSquare.rank}
          suit={action.targetSquare.suit}
          deck={deck}
          className="absolute inset-0 w-full h-full"
        />
      )}
      {/* Played-card layer. When showSlice is on, this gets a corner clipped
          so the target card underneath peeks through. */}
      <div
        className="absolute inset-0"
        style={
          showSlice
            ? {
                clipPath: "polygon(0 0, 100% 0, 100% 40%, 40% 100%, 0 100%)",
              }
            : undefined
        }
      >
        <MiniCardArt
          rank={action.card.rank}
          suit={action.card.suit}
          deck={deck}
          className="absolute inset-0 w-full h-full"
        />
      </div>
      {showSlice && (
        <span
          className="absolute top-1 right-1 text-[0.55rem] bg-zinc-900/80 text-zinc-100 px-1 py-0.5 rounded font-semibold"
          aria-hidden="true"
        >
          J
        </span>
      )}
    </div>
  );
}

function MiniCardArt({
  rank,
  suit,
  deck,
  className,
}: {
  rank: import("@sequence/shared").Rank;
  suit: import("@sequence/shared").Suit;
  deck: DeckManifest | null;
  className?: string;
}) {
  if (deck) {
    const url = cardImageUrl(deck, rank, suit);
    if (url) {
      return (
        <img
          src={url}
          alt=""
          draggable={false}
          className={`object-cover bg-white ${className ?? ""}`}
        />
      );
    }
  }
  const color = SUIT_COLOR[suit];
  return (
    <div className={`relative bg-white ${className ?? ""}`}>
      <div className={`absolute top-0.5 left-1 leading-none ${color} text-[0.6rem] font-semibold`}>
        <div>{RANK_DISPLAY[rank]}</div>
        <div>{SUIT_SYMBOL[suit]}</div>
      </div>
      <div className={`absolute inset-0 flex items-center justify-center ${color} text-xl`}>
        {SUIT_SYMBOL[suit]}
      </div>
    </div>
  );
}

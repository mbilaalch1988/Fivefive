import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Quick-reference card for new players. Modal opened from the top-right menu,
 * dismissed on backdrop tap, Esc, or the close button.
 */
export function RulesSheet({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overlay-enter"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Game rules"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="rules-sheet"
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
        style={{ background: "var(--md-surface-1)" }}
      >
        <header className="sticky top-0 flex items-center justify-between px-5 py-4 border-b border-zinc-800" style={{ background: "var(--md-surface-1)" }}>
          <h2 className="text-lg font-medium tracking-tight">How to play</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full hover:bg-ff-navy-card/50 flex items-center justify-center text-zinc-400 hover:text-ff-cream transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </header>

        <div className="px-5 py-4 space-y-5 text-sm leading-relaxed">
          <Section title="Goal">
            Be the first team to complete the agreed number of <b>fivefives</b> —
            five chips in a row (horizontal, vertical, or diagonal). The host
            sets the target before pressing Start.
          </Section>

          <Section title="Your turn">
            <ol className="list-decimal list-inside space-y-1">
              <li>Tap a card in your hand to preview where it can go.</li>
              <li>Tap any pulsing square on the board to place your chip.</li>
              <li>You automatically draw a new card.</li>
            </ol>
          </Section>

          <Section title="Corners are wild">
            The four corner squares count as both teams' chips for any
            fivefive that runs through them. Use them to bridge two short runs.
          </Section>

          <Section title="The Jacks">
            <ul className="space-y-2">
              <li>
                <Badge>Two-eyed</Badge> <span className="text-zinc-300">J♦ and J♣ are <b>wild</b>.</span>{" "}
                Play one to place a chip on any empty square.
              </li>
              <li>
                <Badge tone="rose">One-eyed</Badge> <span className="text-zinc-300">J♥ and J♠ are <b>removers</b>.</span>{" "}
                Play one to remove an opponent's chip. Chips already part of a
                completed fivefive are locked and cannot be removed.
              </li>
            </ul>
          </Section>

          <Section title="Dead card?">
            If both board squares for a card you're holding are already
            occupied, the card is <b>dead</b>. Tap it and use{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-ff-navy-soft text-xs">Discard dead card</kbd>{" "}
            to throw it away and draw — once per turn, before placing.
          </Section>

          <Section title="Fivefive overlap">
            A chip can count toward two different fivefives, but only one chip
            from your previous fivefive can be re-used in the new one.
          </Section>

          <Section title="Winning">
            The instant your team's fivefive count hits the target, the game
            ends. The winner is announced and the player who closed the final
            fivefive is marked <span className="text-amber-300 font-medium">MVP</span>.
          </Section>
        </div>

        <footer className="px-5 py-4 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="state-layer w-full py-2.5 rounded-full font-medium text-ff-navy bg-ff-gold hover:bg-ff-cream-soft transition-colors"
          >
            Got it
          </button>
        </footer>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs uppercase tracking-widest font-semibold" style={{ color: "var(--md-on-surface-variant)" }}>
        {title}
      </h3>
      <div className="text-ff-cream">{children}</div>
    </section>
  );
}

function Badge({ children, tone = "indigo" }: { children: React.ReactNode; tone?: "indigo" | "rose" }) {
  const cls =
    tone === "rose"
      ? "bg-rose-500/15 border-rose-400/40 text-rose-200"
      : "bg-ff-gold/15 border-ff-gold/40 text-ff-cream";
  return (
    <span className={`inline-block text-[0.65rem] uppercase tracking-widest font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {children}
    </span>
  );
}

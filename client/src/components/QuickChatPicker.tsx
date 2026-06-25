import { useEffect } from "react";
import { QUICK_CHATS } from "@fivefive/shared";

interface Props {
  open: boolean;
  onSend: (chatId: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Bottom-sheet grid of canned messages. Tapping one sends it and closes the
 * sheet immediately. Mirrors StickerPicker's interaction model so the two
 * feel consistent.
 */
export function QuickChatPicker({ open, onSend, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function pick(id: string) {
    try { await onSend(id); } catch { /* swallow */ }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overlay-enter"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Quick chat"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="quickchat-picker"
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl"
        style={{ background: "var(--md-surface-1)" }}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <h2 className="text-base font-medium tracking-tight">Quick chat</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full hover:bg-ff-navy-card/50 flex items-center justify-center text-zinc-400 hover:text-ff-cream transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </header>
        <div className="grid grid-cols-2 gap-2 p-4">
          {QUICK_CHATS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c.id)}
              data-testid={`quickchat-${c.id}`}
              className="state-layer flex items-center gap-2 px-3 py-3 rounded-2xl text-left hover:bg-ff-navy-card/40 transition-colors"
              style={{ background: "var(--md-surface-2)" }}
            >
              <span className="text-xl">{c.emoji}</span>
              <span className="text-sm font-medium text-ff-cream">{c.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

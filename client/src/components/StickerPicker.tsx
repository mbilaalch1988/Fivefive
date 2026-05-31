import { useState } from "react";
import { STICKERS } from "@sequence/shared";

interface Props {
  onSend: (stickerId: string) => void;
}

const STICKER_URL = (id: string) => `/stickers/${id}.png`;

/**
 * Floating sticker button (bottom-left) → opens a 6×4 grid picker popover.
 * Clicking a sticker calls onSend and closes the picker.
 */
export function StickerPicker({ onSend }: Props) {
  const [open, setOpen] = useState(false);

  function pick(id: string) {
    onSend(id);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="sticker-button"
        title="Send a sticker"
        className="state-layer fixed z-30 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-indigo-500/90 hover:bg-indigo-500 text-2xl shadow-lg shadow-indigo-900/40 flex items-center justify-center backdrop-blur"
        style={{
          left: "calc(env(safe-area-inset-left, 0px) + 8px)",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 70px)",
        }}
        aria-label="Open sticker picker"
      >
        😀
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-start p-2 overlay-enter"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-3xl p-3 shadow-2xl ml-auto mr-auto"
            style={{ background: "var(--md-surface-1)" }}
          >
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-xs uppercase tracking-widest" style={{ color: "var(--md-on-surface-variant)" }}>
                Stickers
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="state-layer text-zinc-300 hover:text-white text-xs uppercase tracking-widest font-medium px-3 py-1 rounded-full"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {STICKERS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pick(s.id)}
                  title={s.label}
                  data-testid={`sticker-pick-${s.id}`}
                  className="state-layer aspect-square rounded-xl p-1 hover:bg-zinc-700/50 transition-colors"
                >
                  <img
                    src={STICKER_URL(s.id)}
                    alt={s.label}
                    className="w-full h-full object-contain"
                    draggable={false}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

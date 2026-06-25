import { STICKERS, stickerUrlPath } from "@fivefive/shared";

interface Props {
  open: boolean;
  onSend: (stickerId: string) => void;
  onClose: () => void;
}

const STICKER_URL = (id: string) => stickerUrlPath(id) ?? "";

/**
 * Sticker grid dialog. Open/close is controlled by the parent (game menu)
 * — the floating FAB that used to launch this lives on the menu now.
 */
export function StickerPicker({ open, onSend, onClose }: Props) {
  if (!open) return null;

  function pick(id: string) {
    onSend(id);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center p-2 overlay-enter"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-3xl p-3 shadow-2xl mb-2"
        style={{ background: "var(--md-surface-1)" }}
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <h3 className="text-xs uppercase tracking-widest" style={{ color: "var(--md-on-surface-variant)" }}>
            Stickers
          </h3>
          <button
            type="button"
            onClick={onClose}
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
              className="state-layer aspect-square rounded-xl p-1 hover:bg-ff-navy-card/50 transition-colors"
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
  );
}

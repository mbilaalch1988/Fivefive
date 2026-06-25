import type { StickerBroadcast } from "@fivefive/shared";
import { stickerUrlPath } from "@fivefive/shared";
import { makeNickname } from "../lib/nickname";

interface Props {
  /** Active stickers; rendered most-recent-on-top. */
  stickers: StickerBroadcast[];
}

const STICKER_URL = (id: string) => stickerUrlPath(id) ?? "";

/**
 * Floating overlay that shows incoming stickers from any player. Each sticker
 * spawns its own DOM element with a one-shot pop-in/fade-out animation. The
 * parent (GameScreen) is responsible for removing stale entries from `stickers`
 * after the animation duration.
 */
export function StickerOverlay({ stickers }: Props) {
  if (stickers.length === 0) return null;
  return (
    <div
      className="fixed inset-x-0 z-40 pointer-events-none flex flex-col items-center gap-3"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 130px)",
      }}
    >
      {stickers.map((s) => (
        <div
          key={s.eventId}
          className="sticker-pop flex flex-col items-center"
        >
          <img
            src={STICKER_URL(s.stickerId)}
            alt=""
            className="w-24 h-24 sm:w-28 sm:h-28 drop-shadow-[0_4px_18px_rgba(0,0,0,0.5)]"
            draggable={false}
          />
          <span
            className="mt-1 px-2 py-0.5 rounded-full text-[0.65rem] sm:text-xs font-semibold bg-zinc-900/80 text-zinc-100 backdrop-blur"
            title={s.fromName}
          >
            {makeNickname(s.fromName)}
          </span>
        </div>
      ))}
    </div>
  );
}

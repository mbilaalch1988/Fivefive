import type { QuickChatBroadcast } from "@fivefive/shared";
import { getQuickChat } from "@fivefive/shared";
import { TEAM_CHIP, TEAM_TEXT } from "../lib/cards";
import { makeNickname } from "../lib/nickname";

interface Props {
  /** Active quick-chat events; newest at the end. */
  chats: QuickChatBroadcast[];
}

/**
 * Floating chat bubbles, same lifecycle as StickerOverlay but slightly higher
 * on screen so a sticker + chat sent at once don't collide. The bubble takes
 * the sender's team tint.
 */
export function QuickChatOverlay({ chats }: Props) {
  if (chats.length === 0) return null;
  return (
    <div
      className="fixed inset-x-0 z-40 pointer-events-none flex flex-col items-center gap-2"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 270px)" }}
    >
      {chats.map((c) => {
        const info = getQuickChat(c.chatId);
        if (!info) return null;
        const tint = c.fromTeam ? TEAM_CHIP[c.fromTeam] : "bg-ff-navy-soft";
        const nameColor = c.fromTeam ? TEAM_TEXT[c.fromTeam] : "text-zinc-300";
        return (
          <div key={c.eventId} className="sticker-pop flex flex-col items-center">
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-lg shadow-black/40 ${tint}`}
              style={{ border: "2px solid #18181b" }}
            >
              <span className="text-base leading-none">{info.emoji}</span>
              <span className="text-white text-sm font-semibold leading-none">
                {info.text}
              </span>
            </div>
            <span
              className={`mt-1 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold bg-ff-navy/80 backdrop-blur ${nameColor}`}
              title={c.fromName}
            >
              {makeNickname(c.fromName)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Canned quick-chat messages. Like stickers but text-only — no moderation
 * surface area, no free-text. Players tap one and it floats up over the
 * playfield identical to the sticker overlay.
 */

export interface QuickChatInfo {
  id: string;
  /** What the recipient sees in the floating bubble. */
  text: string;
  /** Small icon prefix (an emoji char). */
  emoji: string;
}

export const QUICK_CHATS: readonly QuickChatInfo[] = [
  { id: "nice",    text: "Nice play!",      emoji: "🎯" },
  { id: "gg",      text: "Good game",       emoji: "🤝" },
  { id: "oof",     text: "Oof.",            emoji: "😬" },
  { id: "watch",   text: "Watch out!",      emoji: "⚠️" },
  { id: "yourgo",  text: "Your turn!",      emoji: "👉" },
  { id: "think",   text: "Thinking…",       emoji: "🤔" },
  { id: "sorry",   text: "Sorry!",          emoji: "🙏" },
  { id: "letsgo",  text: "Let's go!",       emoji: "🔥" },
] as const;

const QUICK_CHAT_IDS = new Set(QUICK_CHATS.map((c) => c.id));

export function isValidQuickChatId(id: string): boolean {
  return QUICK_CHAT_IDS.has(id);
}

export function getQuickChat(id: string): QuickChatInfo | null {
  return QUICK_CHATS.find((c) => c.id === id) ?? null;
}

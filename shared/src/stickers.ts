/**
 * Catalog of all available stickers. The `id` matches the filename (without
 * extension) of the asset under client/public/stickers/. Both client and
 * server import this list — client renders the picker grid, server validates
 * incoming sendSticker events against this set.
 */
export interface StickerInfo {
  id: string;
  label: string;
}

export const STICKERS: readonly StickerInfo[] = [
  { id: "got-this",         label: "Got this!" },
  { id: "no-way",           label: "No way!" },
  { id: "thinking",         label: "Thinking..." },
  { id: "my-sequence",      label: "My sequence!" },
  { id: "on-fire",          label: "On fire!" },
  { id: "just-wait",        label: "Just wait!" },
  { id: "didnt-see-that",   label: "Didn't see that!" },
  { id: "perfect-card",     label: "Perfect card!" },
  { id: "sequence",         label: "Sequence!" },
  { id: "blocked",          label: "Blocked!" },
  { id: "jack-played",      label: "Jack played!" },
  { id: "sequence-broken",  label: "Sequence broken!" },
  { id: "watching-you",     label: "Watching you!" },
  { id: "you-win",          label: "You win!" },
  { id: "your-turn",        label: "Your turn!" },
  { id: "bad-hand",         label: "Bad hand!" },
  { id: "nice-move",        label: "Nice move!" },
  { id: "oops",             label: "Oops!" },
  { id: "hahaha",           label: "Hahaha!" },
  { id: "good-luck",        label: "Good luck!" },
  { id: "too-easy",         label: "Too easy!" },
  { id: "love-this",        label: "Love this!" },
  { id: "gg",               label: "GG!" },
  { id: "good-game",        label: "Good game!" },
] as const;

export const STICKER_IDS: ReadonlySet<string> = new Set(STICKERS.map((s) => s.id));

export function isValidStickerId(id: string): boolean {
  return STICKER_IDS.has(id);
}

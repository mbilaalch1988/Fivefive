/**
 * Catalog of all available stickers. Each entry references a file under
 * client/public/stickers/ via {id}.{ext} — most are animated GIFs, gg is a
 * still PNG. Both client and server import this list: client renders the
 * picker grid + builds URLs from id+ext, server validates incoming
 * sendSticker events against the id set.
 */
export interface StickerInfo {
  id: string;
  label: string;
  /** File extension (no dot). Lets us mix gif/png/webp in the same pack. */
  ext: "gif" | "png" | "webp";
}

export const STICKERS: readonly StickerInfo[] = [
  { id: "got-this",         label: "Got this!",         ext: "gif" },
  { id: "no-way",           label: "No way!",           ext: "gif" },
  { id: "thinking",         label: "Thinking...",       ext: "gif" },
  { id: "my-sequence",      label: "My sequence!",      ext: "gif" },
  { id: "on-fire",          label: "On fire!",          ext: "gif" },
  { id: "just-wait",        label: "Just wait!",        ext: "gif" },
  { id: "didnt-see-that",   label: "Didn't see that!",  ext: "gif" },
  { id: "perfect-card",     label: "Perfect card!",     ext: "gif" },
  { id: "sequence",         label: "Fivefive!",         ext: "gif" },
  { id: "blocked",          label: "Blocked!",          ext: "gif" },
  { id: "jack-played",      label: "Jack played!",      ext: "gif" },
  { id: "sequence-broken",  label: "Fivefive broken!",  ext: "gif" },
  { id: "watching-you",     label: "Watching you!",     ext: "gif" },
  { id: "you-win",          label: "You win!",          ext: "gif" },
  { id: "your-turn",        label: "Your turn!",        ext: "gif" },
  { id: "bad-hand",         label: "Bad hand!",         ext: "gif" },
  { id: "nice-move",        label: "Nice move!",        ext: "gif" },
  { id: "oops",             label: "Oops!",             ext: "gif" },
  { id: "hahaha",           label: "Hahaha!",           ext: "gif" },
  { id: "good-luck",        label: "Good luck!",        ext: "gif" },
  { id: "too-easy",         label: "Too easy!",         ext: "gif" },
  { id: "love-this",        label: "Love this!",        ext: "gif" },
  { id: "gg",               label: "GG!",               ext: "png" },
  { id: "good-game",        label: "Good game!",        ext: "gif" },
] as const;

export const STICKER_IDS: ReadonlySet<string> = new Set(STICKERS.map((s) => s.id));

export function isValidStickerId(id: string): boolean {
  return STICKER_IDS.has(id);
}

/** Build the public URL path for a sticker, by id. */
export function stickerUrlPath(id: string): string | null {
  const s = STICKERS.find((x) => x.id === id);
  return s ? `/stickers/${s.id}.${s.ext}` : null;
}

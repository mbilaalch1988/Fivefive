/**
 * One-off slicer: takes the composite sticker sheet (6 columns × 4 rows) and
 * writes 24 named PNGs into client/public/stickers/.
 *
 * Transparency strategy:
 *   - The cell is split conceptually into ART (top ~78%) and CAPTION (bottom).
 *   - In the ART region: BFS flood-fill from top/left/right edges through an
 *     ERODED white mask. Erosion (1 px) kills anti-aliased outline pixels that
 *     would otherwise let the flood-fill leak into character bodies. The flood
 *     is also y-bounded so it can't cross into the caption strip and re-enter
 *     the body from below.
 *   - The CAPTION region (bottom 22%) is left fully opaque so the dark sticker
 *     text stays readable on the dark game UI.
 *
 * Usage:
 *   npx tsx server/scripts/slice-stickers.ts "<path-to-composite.png>"
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const OUT_DIR = join(REPO_ROOT, "client", "public", "stickers");

const LABELS = [
  "got-this", "no-way", "thinking", "my-fivefive", "on-fire", "just-wait",
  "didnt-see-that", "perfect-card", "fivefive", "blocked", "jack-played", "fivefive-broken",
  "watching-you", "you-win", "your-turn", "bad-hand", "nice-move", "oops",
  "hahaha", "good-luck", "too-easy", "love-this", "gg", "good-game",
];

const COLS = 6;
const ROWS = 4;

/** A pixel is considered potential-background if its min channel is at least this. */
const WHITE_THRESHOLD = 245;
/** Top fraction of the cell that's sticker art (the rest is the caption). */
const ART_RATIO = 0.78;

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("usage: slice-stickers.ts <composite.png>");
    process.exit(2);
  }
  if (!existsSync(input)) {
    console.error(`not found: ${input}`);
    process.exit(2);
  }
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height) throw new Error("could not read image dimensions");
  const cellW = Math.floor(meta.width / COLS);
  const cellH = Math.floor(meta.height / ROWS);
  console.log(`composite ${meta.width}x${meta.height} → ${COLS}×${ROWS} cells of ${cellW}x${cellH}`);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      const name = LABELS[idx];
      if (!name) continue;
      const out = join(OUT_DIR, `${name}.png`);

      const { data, info } = await sharp(input)
        .extract({ left: c * cellW, top: r * cellH, width: cellW, height: cellH })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      knockOutArtBackground(data, info.width, info.height);

      await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
        .png({ compressionLevel: 9 })
        .toFile(out);
      console.log(`  wrote ${name}.png`);
    }
  }
  console.log(`done → ${OUT_DIR}`);
}

/**
 * Knock out the background in the top ART_RATIO of the cell, leaving the
 * caption strip fully opaque.
 */
function knockOutArtBackground(data: Buffer, width: number, height: number): void {
  const total = width * height;
  const artHeight = Math.floor(height * ART_RATIO);

  // ----- Step 1: classify pixels as "near-white" -----
  const isNearWhite = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const r = data[o]!;
    const g = data[o + 1]!;
    const b = data[o + 2]!;
    if (Math.min(r, g, b) >= WHITE_THRESHOLD) {
      isNearWhite[i] = 1;
    }
  }

  // ----- Step 2: erode the near-white mask by 1 px (4-neighborhood) -----
  // A pixel survives only if it AND all four neighbors are near-white.
  // Anti-aliased outline pixels (white-ish but next to colored pixels) get
  // dropped from the mask, sealing tiny gaps in character outlines.
  const erodedBg = new Uint8Array(total);
  for (let y = 0; y < artHeight; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!isNearWhite[i]) continue;
      if (x > 0           && !isNearWhite[i - 1])      continue;
      if (x < width - 1   && !isNearWhite[i + 1])      continue;
      if (y > 0           && !isNearWhite[i - width])  continue;
      if (y < artHeight-1 && !isNearWhite[i + width])  continue;
      erodedBg[i] = 1;
    }
  }

  // ----- Step 3: BFS flood-fill from top/left/right edges of the ART region -----
  // The bottom edge (y = artHeight - 1) is deliberately NOT seeded, so the
  // flood can't escape down into the caption and re-enter character bodies
  // from below.
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const tryEnqueue = (i: number): void => {
    if (visited[i]) return;
    if (!erodedBg[i]) return;
    visited[i] = 1;
    queue[tail++] = i;
  };

  for (let x = 0; x < width; x++) tryEnqueue(x); // top edge
  for (let y = 0; y < artHeight; y++) {
    tryEnqueue(y * width);                       // left edge
    tryEnqueue(y * width + (width - 1));         // right edge
  }

  while (head < tail) {
    const i = queue[head++]!;
    data[i * 4 + 3] = 0;

    const x = i % width;
    const y = (i - x) / width;
    if (x > 0)              tryEnqueue(i - 1);
    if (x < width - 1)      tryEnqueue(i + 1);
    if (y > 0)              tryEnqueue(i - width);
    if (y < artHeight - 1)  tryEnqueue(i + width); // stop at art/caption boundary
  }

  // ----- Step 4: soften the edge in the ART region only -----
  // Opaque pixels adjacent to a transparent one with a near-white color get
  // partial alpha to kill the white halo.
  for (let y = 0; y < artHeight; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = i * 4;
      if (data[o + 3] === 0) continue;
      const minC = Math.min(data[o]!, data[o + 1]!, data[o + 2]!);
      if (minC < WHITE_THRESHOLD - 30) continue;
      let hasTransparentNeighbor = false;
      if (x > 0             && data[(i - 1) * 4 + 3]     === 0) hasTransparentNeighbor = true;
      else if (x < width-1  && data[(i + 1) * 4 + 3]     === 0) hasTransparentNeighbor = true;
      else if (y > 0        && data[(i - width) * 4 + 3] === 0) hasTransparentNeighbor = true;
      else if (y < artHeight-1 && data[(i + width) * 4 + 3] === 0) hasTransparentNeighbor = true;
      if (hasTransparentNeighbor) {
        const fade = Math.max(0, Math.min(255, (255 - minC) * 8));
        data[o + 3] = fade;
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

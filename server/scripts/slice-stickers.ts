/**
 * One-off slicer: takes the composite sticker sheet (6 columns × 4 rows) and
 * writes 24 named PNGs into client/public/stickers/.
 *
 * - Includes the full cell (sticker art + the text label below it).
 * - Removes the white background via BFS flood-fill from the edges, so the
 *   panda's white body (which isn't connected to the outer background) stays
 *   intact.
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

// Reading order: left → right, top → bottom. Matches the composite layout.
const LABELS = [
  "got-this", "no-way", "thinking", "my-sequence", "on-fire", "just-wait",
  "didnt-see-that", "perfect-card", "sequence", "blocked", "jack-played", "sequence-broken",
  "watching-you", "you-win", "your-turn", "bad-hand", "nice-move", "oops",
  "hahaha", "good-luck", "too-easy", "love-this", "gg", "good-game",
];

const COLS = 6;
const ROWS = 4;

/** Pixel counts as "background-white" if its min RGB channel is at least this. */
const WHITE_THRESHOLD = 235;

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

      // 1. Extract the full cell (art + label).
      const { data, info } = await sharp(input)
        .extract({ left: c * cellW, top: r * cellH, width: cellW, height: cellH })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // 2. Flood-fill background → transparent.
      knockOutBackground(data, info.width, info.height);

      // 3. Re-encode as PNG.
      await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
        .png({ compressionLevel: 9 })
        .toFile(out);
      console.log(`  wrote ${name}.png`);
    }
  }
  console.log(`done → ${OUT_DIR}`);
}

/**
 * BFS from every edge pixel that's "background-white", marking each visited
 * pixel transparent. Stops at any colored boundary, so interior whites (panda
 * fur, sticker highlights) survive.
 */
function knockOutBackground(data: Buffer, width: number, height: number): void {
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const isWhite = (i: number): boolean => {
    const o = i * 4;
    const r = data[o]!;
    const g = data[o + 1]!;
    const b = data[o + 2]!;
    return Math.min(r, g, b) >= WHITE_THRESHOLD;
  };

  const enqueue = (i: number): void => {
    if (visited[i]) return;
    if (!isWhite(i)) return;
    visited[i] = 1;
    queue[tail++] = i;
  };

  // Seed from all four edges.
  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    enqueue(y * width);
    enqueue(y * width + (width - 1));
  }

  while (head < tail) {
    const i = queue[head++]!;
    data[i * 4 + 3] = 0; // alpha = 0

    const x = i % width;
    const y = (i - x) / width;
    if (x > 0)          enqueue(i - 1);
    if (x < width - 1)  enqueue(i + 1);
    if (y > 0)          enqueue(i - width);
    if (y < height - 1) enqueue(i + width);
  }

  // Soften the edge: any opaque pixel adjacent to a transparent one with
  // a near-white color gets partial alpha (kills the ring artifact). Cheap
  // single-pass smoothing.
  for (let i = 0; i < total; i++) {
    if (data[i * 4 + 3] === 0) continue; // already transparent
    const o = i * 4;
    const r = data[o]!;
    const g = data[o + 1]!;
    const b = data[o + 2]!;
    const minC = Math.min(r, g, b);
    if (minC < WHITE_THRESHOLD - 30) continue; // not whitish
    // Check if any 4-neighbor is transparent (i.e. we're on the boundary).
    const x = i % width;
    const y = (i - x) / width;
    let hasTransparentNeighbor = false;
    if (x > 0          && data[(i - 1) * 4 + 3]      === 0) hasTransparentNeighbor = true;
    else if (x < width - 1  && data[(i + 1) * 4 + 3]      === 0) hasTransparentNeighbor = true;
    else if (y > 0          && data[(i - width) * 4 + 3]  === 0) hasTransparentNeighbor = true;
    else if (y < height - 1 && data[(i + width) * 4 + 3]  === 0) hasTransparentNeighbor = true;
    if (hasTransparentNeighbor) {
      // Fade based on how close to pure white it is.
      const fade = Math.max(0, Math.min(255, (255 - minC) * 8));
      data[o + 3] = fade;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

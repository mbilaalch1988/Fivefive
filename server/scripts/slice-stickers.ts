/**
 * One-off slicer: takes the composite sticker sheet (6 columns × 4 rows, each
 * cell 256×256) and writes 24 named PNGs into client/public/stickers/.
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
  // Row 0
  "got-this", "no-way", "thinking", "my-sequence", "on-fire", "just-wait",
  // Row 1
  "didnt-see-that", "perfect-card", "sequence", "blocked", "jack-played", "sequence-broken",
  // Row 2
  "watching-you", "you-win", "your-turn", "bad-hand", "nice-move", "oops",
  // Row 3
  "hahaha", "good-luck", "too-easy", "love-this", "gg", "good-game",
];

const COLS = 6;
const ROWS = 4;

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

  const img = sharp(input);
  const meta = await img.metadata();
  if (!meta.width || !meta.height) {
    throw new Error("could not read image dimensions");
  }
  const cellW = Math.floor(meta.width / COLS);
  const cellH = Math.floor(meta.height / ROWS);
  console.log(`composite ${meta.width}x${meta.height} → ${COLS}×${ROWS} cells of ${cellW}x${cellH}`);

  // The bottom ~25% of each cell is the text label (which we don't need —
  // we'll render labels in HTML). Crop that off to keep just the sticker art.
  const ART_RATIO = 0.78;
  const artH = Math.floor(cellH * ART_RATIO);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      const name = LABELS[idx];
      if (!name) continue;
      const out = join(OUT_DIR, `${name}.png`);
      await sharp(input)
        .extract({
          left: c * cellW,
          top: r * cellH,
          width: cellW,
          height: artH,
        })
        .png({ compressionLevel: 9, palette: true })
        .toFile(out);
      console.log(`  wrote ${name}.png`);
    }
  }
  console.log(`done → ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DeckManifest, DeckSummary } from "@sequence/shared";

/**
 * Scan Card_layout/ for subdirectories. Each subdir becomes a deck.
 * A deck's manifest is either:
 *  - Read from manifest.json if present, OR
 *  - Auto-derived from filenames matching <rank><suit>.<ext>, plus a back/front.<ext>.
 *    Ranks 2-9, 10 (or T), J, Q, K, A. Suits S/H/D/C. Extensions jpg/jpeg/png/webp.
 *    "10X" is normalized to "TX" in the cards map (the game engine uses single-char ranks).
 */
export class DeckRegistry {
  private byId = new Map<string, DeckManifest>();
  private summaries: DeckSummary[] = [];

  constructor(private rootDir: string) {
    this.load();
  }

  /** Clear cache and re-scan Card_layout/. Called by POST /api/decks/refresh. */
  reload(): void {
    this.byId.clear();
    this.summaries = [];
    this.load();
  }

  private load(): void {
    if (!existsSync(this.rootDir)) {
      console.log(`[decks] no Card_layout/ at ${this.rootDir}, deck selection disabled`);
      return;
    }
    let entries: string[];
    try {
      entries = readdirSync(this.rootDir);
    } catch (e) {
      console.warn(`[decks] failed to read ${this.rootDir}: ${(e as Error).message}`);
      return;
    }
    for (const name of entries) {
      const dir = join(this.rootDir, name);
      if (!safeIsDir(dir)) continue;
      const manifest = this.loadDeck(name, dir);
      if (!manifest) continue;
      this.byId.set(manifest.id, manifest);
      this.summaries.push({ id: manifest.id, name: manifest.name });
    }
    this.summaries.sort((a, b) => a.name.localeCompare(b.name));
    if (this.byId.size > 0) {
      console.log(`[decks] loaded ${this.byId.size} deck(s): ${this.summaries.map((s) => s.id).join(", ")}`);
    }
  }

  private loadDeck(folderName: string, dir: string): DeckManifest | null {
    const manifestPath = join(dir, "manifest.json");
    if (existsSync(manifestPath)) {
      try {
        const raw = readFileSync(manifestPath, "utf8");
        const parsed = JSON.parse(raw) as DeckManifest;
        if (!parsed.id || !parsed.back || !parsed.cards) {
          console.warn(`[decks] ${folderName}/manifest.json missing required fields, skipped`);
          return null;
        }
        return parsed;
      } catch (e) {
        console.warn(`[decks] ${folderName}/manifest.json invalid: ${(e as Error).message}`);
        return null;
      }
    }
    return autoDerive(folderName, dir);
  }

  list(): DeckSummary[] {
    return this.summaries.slice();
  }

  get(id: string): DeckManifest | undefined {
    return this.byId.get(id);
  }
}

const CARD_RE = /^(10|[2-9TJQKA])([SHDC])\.(jpe?g|png|webp)$/i;
const BACK_RE = /^(back|front)\.(jpe?g|png|webp)$/i;

function autoDerive(folderName: string, dir: string): DeckManifest | null {
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return null;
  }
  let back: string | null = null;
  const cards: Record<string, string> = {};

  for (const f of files) {
    const m = f.match(CARD_RE);
    if (m) {
      const rank = m[1]!.toUpperCase() === "10" ? "T" : m[1]!.toUpperCase();
      const suit = m[2]!.toUpperCase();
      cards[`${rank}${suit}`] = f;
      continue;
    }
    if (!back && BACK_RE.test(f)) {
      back = f;
    }
  }

  const cardCount = Object.keys(cards).length;
  if (cardCount < 40) {
    console.warn(`[decks] ${folderName}: only ${cardCount} cards detected, skipped (need ≥40)`);
    return null;
  }
  if (!back) {
    console.log(`[decks] ${folderName}: no back.* / front.* found — using default striped back pattern`);
  }
  return {
    id: folderName,
    name: folderName.replace(/_/g, " "),
    // Empty string signals "no specific back image" → client falls back to
    // the built-in diagonal-stripe pattern used when no deck is selected.
    back: back ?? "",
    cards,
  };
}

function safeIsDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

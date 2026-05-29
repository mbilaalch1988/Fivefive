import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DeckManifest, DeckSummary } from "@sequence/shared";

/**
 * Scan Card_layout/ for subdirectories containing a manifest.json. Each
 * matching subdir becomes an available deck. Result is cached at startup;
 * adding decks while the server runs requires a restart.
 */
export class DeckRegistry {
  private byId = new Map<string, DeckManifest>();
  private summaries: DeckSummary[] = [];

  constructor(private rootDir: string) {
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
      const manifestPath = join(dir, "manifest.json");
      if (!existsSync(manifestPath)) continue;
      try {
        const raw = readFileSync(manifestPath, "utf8");
        const parsed = JSON.parse(raw) as DeckManifest;
        if (!parsed.id || !parsed.back || !parsed.cards) {
          console.warn(`[decks] ${name}/manifest.json missing required fields, skipped`);
          continue;
        }
        this.byId.set(parsed.id, parsed);
        this.summaries.push({ id: parsed.id, name: parsed.name ?? parsed.id });
      } catch (e) {
        console.warn(`[decks] ${name}/manifest.json invalid: ${(e as Error).message}`);
      }
    }
    if (this.byId.size > 0) {
      console.log(`[decks] loaded ${this.byId.size} deck(s): ${[...this.byId.keys()].join(", ")}`);
    }
  }

  list(): DeckSummary[] {
    return this.summaries.slice();
  }

  get(id: string): DeckManifest | undefined {
    return this.byId.get(id);
  }
}

function safeIsDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

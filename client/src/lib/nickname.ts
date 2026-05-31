/**
 * Build a compact ≤3-letter badge label from a full display name.
 *
 * Rules (per product spec):
 *   - One-word names → first letter + last letter, uppercase. ("Alice" → "AE")
 *   - Multi-word names → first letter of each word, take up to 3 of them. ("Mary Anne Jones" → "MAJ")
 *   - Single-letter input → uppercase as-is.
 *   - Empty / undefined input → "?" sentinel.
 */
export function makeNickname(fullName: string | null | undefined): string {
  if (!fullName) return "?";
  const trimmed = fullName.trim();
  if (!trimmed) return "?";
  const words = trimmed.split(/\s+/);
  if (words.length === 1) {
    const w = words[0]!;
    if (w.length === 1) return w.toUpperCase();
    return (w[0]! + w[w.length - 1]!).toUpperCase();
  }
  return words.slice(0, 3).map((w) => w[0]!).join("").toUpperCase();
}

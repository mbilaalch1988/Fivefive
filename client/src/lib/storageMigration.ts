/**
 * One-time migration of localStorage keys from the original "sequence.*"
 * namespace to the rebranded "fivefive.*" namespace. Runs synchronously on
 * app boot before any reader touches storage.
 *
 * Migration semantics: for each pair, if the new key is unset and the old
 * key holds a value, copy old → new. The old key is then removed so a
 * second run is a no-op.
 *
 * A sentinel flag prevents repeated scans after the first successful
 * migration on a device.
 */
const MIGRATION_DONE_KEY = "fivefive.migration.v1.done";

const KEY_PAIRS: Array<[oldKey: string, newKey: string]> = [
  ["sequence.playerName", "fivefive.playerName"],
  ["sequence.claimPromptDone", "fivefive.claimPromptDone"],
  ["sequence.session", "fivefive.session"],
  ["sequence.spectate", "fivefive.spectate"],
  ["sequence.muteChime", "fivefive.muteChime"],
  ["sequence.muteVibration", "fivefive.muteVibration"],
  ["sequence.pushEnabled", "fivefive.pushEnabled"],
  ["sequence.colorblind", "fivefive.colorblind"],
  ["sequence.installDismissed", "fivefive.installDismissed"],
];

export function migrateLegacyStorage(): void {
  try {
    if (localStorage.getItem(MIGRATION_DONE_KEY) === "1") return;
    for (const [oldKey, newKey] of KEY_PAIRS) {
      const oldVal = localStorage.getItem(oldKey);
      if (oldVal === null) continue;
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, oldVal);
      }
      localStorage.removeItem(oldKey);
    }
    localStorage.setItem(MIGRATION_DONE_KEY, "1");
  } catch {
    /* ignore — storage may be disabled (private mode, quota) */
  }
}

/**
 * Client-side web push helpers. Wraps the awkward Notification permission
 * + service worker + PushManager dance into a single ergonomic API.
 *
 * Server endpoints used:
 *   GET  /api/push/vapid-key          → { publicKey }
 *   POST /api/push/subscribe          ← { subscription, roomCode, playerId }
 *   POST /api/push/unsubscribe        ← { endpoint }
 */

const SERVER_BASE =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? "http://localhost:3001" : "");

const PUSH_ENABLED_KEY = "sequence.pushEnabled";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getStoredPushPref(): boolean {
  try { return localStorage.getItem(PUSH_ENABLED_KEY) === "1"; } catch { return false; }
}
function setStoredPushPref(on: boolean): void {
  try {
    if (on) localStorage.setItem(PUSH_ENABLED_KEY, "1");
    else localStorage.removeItem(PUSH_ENABLED_KEY);
  } catch { /* ignore */ }
}

let cachedVapidKey: string | null | undefined = undefined;
async function getVapidKey(): Promise<string | null> {
  if (cachedVapidKey !== undefined) return cachedVapidKey;
  try {
    const r = await fetch(`${SERVER_BASE}/api/push/vapid-key`);
    if (!r.ok) {
      cachedVapidKey = null;
      return null;
    }
    const d = (await r.json()) as { publicKey?: string };
    cachedVapidKey = d.publicKey ?? null;
    return cachedVapidKey;
  } catch {
    cachedVapidKey = null;
    return null;
  }
}

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getOrRegisterSW(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration("/sw.js");
    if (existing) return existing;
    return await navigator.serviceWorker.register("/sw.js");
  } catch (e) {
    console.warn("[push] sw register failed:", (e as Error).message);
    return null;
  }
}

/**
 * Subscribe this browser to push notifications for the given room+player.
 * Idempotent — safe to call repeatedly. Returns true on success.
 */
export async function enablePush(roomCode: string, playerId: string): Promise<boolean> {
  if (!isPushSupported()) return false;
  const vapidKey = await getVapidKey();
  if (!vapidKey) {
    console.info("[push] server has no VAPID key configured");
    return false;
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return false;
  const reg = await getOrRegisterSW();
  if (!reg) return false;
  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      // Cast to BufferSource — TS 5.7 narrowed Uint8Array typing in a way
      // that confuses PushManager.subscribe's signature.
      const key = urlBase64ToUint8Array(vapidKey);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key as unknown as BufferSource,
      });
    }
    const subJson = sub.toJSON();
    const res = await fetch(`${SERVER_BASE}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subJson,
        roomCode,
        playerId,
      }),
    });
    if (!res.ok) {
      console.warn("[push] subscribe failed:", res.status);
      return false;
    }
    setStoredPushPref(true);
    return true;
  } catch (e) {
    console.warn("[push] enable failed:", (e as Error).message);
    return false;
  }
}

export async function disablePush(): Promise<void> {
  setStoredPushPref(false);
  if (!isPushSupported()) return;
  const reg = await getOrRegisterSW();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  try {
    await fetch(`${SERVER_BASE}/api/push/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch { /* ignore */ }
  try {
    await sub.unsubscribe();
  } catch { /* ignore */ }
}

/** Current permission + subscription status (best-effort). */
export async function getPushStatus(): Promise<"granted" | "denied" | "default" | "unsupported"> {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

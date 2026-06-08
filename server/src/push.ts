/**
 * Web Push integration. Uses VAPID keys from env vars; if they're missing,
 * the module no-ops so deployments without push configured still work.
 *
 * Required env vars:
 *   VAPID_PUBLIC_KEY   — base64url-encoded public key
 *   VAPID_PRIVATE_KEY  — base64url-encoded private key
 *   VAPID_SUBJECT      — mailto:you@example.com (or https URL)
 *
 * Generate keys once with: npx web-push generate-vapid-keys
 */

import webpush from "web-push";

let configured = false;

export function initPush(): void {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subj) {
    console.log("[push] VAPID keys not set — web push disabled");
    return;
  }
  webpush.setVapidDetails(subj, pub, priv);
  configured = true;
  console.log("[push] web push configured");
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export function isPushConfigured(): boolean {
  return configured;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Used as the notification's `tag` so duplicates collapse. */
  tag: string;
  /** Passed through to the SW so a notification-click can open the right URL. */
  roomCode: string;
}

/**
 * Send a push. Returns true on success, false on transient failure. If the
 * subscription is gone (404/410), throws a SubscriptionGoneError so the
 * caller can delete it from the DB.
 */
export async function sendPush(
  sub: PushSubscriptionRecord,
  payload: PushPayload,
): Promise<boolean> {
  if (!configured) return false;
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 },
    );
    return true;
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string };
    if (err.statusCode === 404 || err.statusCode === 410) {
      throw new SubscriptionGoneError(sub.endpoint);
    }
    console.warn("[push] send failed:", err.message ?? err);
    return false;
  }
}

export class SubscriptionGoneError extends Error {
  constructor(public endpoint: string) {
    super(`subscription gone: ${endpoint}`);
  }
}

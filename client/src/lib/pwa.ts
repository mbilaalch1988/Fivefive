/**
 * PWA install prompt helper. Captures the `beforeinstallprompt` event
 * fired by browsers when the app is installable, lets components query
 * whether install is available, and triggers the native prompt on demand.
 *
 * Behavior:
 *  - Chrome/Edge/Android Chrome: fires beforeinstallprompt → we call .prompt().
 *  - iOS Safari: no event ever fires; install is manual ("Add to Home Screen"
 *    from the share sheet). We detect iOS and surface a manual hint.
 *  - Already installed (display-mode standalone): the entire flow is hidden.
 */

type DeferredInstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: DeferredInstallEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as DeferredInstallEvent;
    for (const fn of listeners) fn();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    for (const fn of listeners) fn();
  });
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // Safari-specific.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredPrompt) return "unavailable";
  try {
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    deferredPrompt = null;
    for (const fn of listeners) fn();
    return result.outcome;
  } catch {
    return "unavailable";
  }
}

export function onPwaStateChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

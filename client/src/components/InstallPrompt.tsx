import { useEffect, useState } from "react";
import {
  canPromptInstall,
  isIos,
  isStandalone,
  onPwaStateChange,
  promptInstall,
} from "../lib/pwa";

/**
 * Bottom-of-landing-screen install hint. Renders:
 *  - Nothing if already installed (display-mode: standalone).
 *  - A real install button on browsers that support beforeinstallprompt.
 *  - A passive "Add to Home Screen" hint on iOS Safari.
 *
 * Auto-hides after the user installs or dismisses.
 */
export function InstallPrompt() {
  const [installable, setInstallable] = useState<boolean>(() => canPromptInstall());
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem("sequence.installDismissed") === "1"; } catch { return false; }
  });

  useEffect(() => {
    return onPwaStateChange(() => setInstallable(canPromptInstall()));
  }, []);

  if (isStandalone() || dismissed) return null;

  // iOS doesn't fire beforeinstallprompt — show the manual hint instead.
  if (isIos() && !installable) {
    return (
      <div
        className="rounded-2xl p-4 text-xs flex items-center gap-3 border"
        style={{
          background: "var(--md-surface-1)",
          borderColor: "var(--md-outline)",
          color: "var(--md-on-surface-variant)",
        }}
      >
        <span className="text-2xl">📲</span>
        <span className="flex-1">
          Tap <b>Share</b> → <b>Add to Home Screen</b> to install Sequence.
        </span>
        <button
          type="button"
          onClick={dismiss}
          className="text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded text-[0.65rem] uppercase tracking-widest"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    );
  }

  if (!installable) return null;

  return (
    <div
      className="rounded-2xl p-4 flex items-center gap-3 border"
      style={{
        background: "rgba(16, 185, 129, 0.10)",
        borderColor: "rgba(52, 211, 153, 0.45)",
      }}
    >
      <span className="text-2xl">📲</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-emerald-200">Install Sequence</div>
        <div className="text-xs text-emerald-300/80">
          Launches from your home screen like a native app.
        </div>
      </div>
      <button
        type="button"
        data-testid="install-button"
        onClick={() => void install()}
        className="state-layer px-4 py-2 rounded-full bg-emerald-500/90 hover:bg-emerald-500 text-white font-medium text-sm shrink-0"
      >
        Install
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="text-emerald-300/60 hover:text-emerald-200 px-2 py-1 rounded text-[0.65rem] uppercase tracking-widest"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );

  async function install() {
    const outcome = await promptInstall();
    if (outcome === "dismissed") dismiss();
  }

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem("sequence.installDismissed", "1"); } catch { /* ignore */ }
  }
}

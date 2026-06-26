import { useEffect, useRef, useState } from "react";
import {
  isChimeMuted,
  isVibrationMuted,
  setChimeMuted,
  setVibrationMuted,
} from "../lib/notify";
import { useOrientation } from "../lib/orientation";
import { isColorBlindMode, setColorBlindMode } from "../lib/prefs";
import {
  disablePush,
  enablePush,
  getStoredPushPref,
  isPushSupported,
} from "../lib/push";

interface Props {
  onOpenStickers: () => void;
  onOpenQuickChat: () => void;
  onOpenHistory: () => void;
  onOpenRules: () => void;
  /** Host-only entry. When null, the Stop game item is hidden. */
  onStopGame: (() => void) | null;
  /** Room code + player id needed to scope push subscriptions. */
  roomCode: string;
  myPlayerId: string | null;
  /** When true, render the items as a permanent panel (no burger button,
   *  no popup) — used inside the large-screen right deck. */
  sidebar?: boolean;
}

/**
 * Top-right floating menu. Replaces the bottom-left sticker FAB and the
 * bottom-right last-played card — collects everything into one drawer so
 * the playfield stays uncluttered.
 */
export function GameMenu({
  onOpenStickers,
  onOpenQuickChat,
  onOpenHistory,
  onOpenRules,
  onStopGame,
  roomCode,
  myPlayerId,
  sidebar = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [chimeMuted, setChimeMutedState]     = useState<boolean>(() => isChimeMuted());
  const [vibrateMuted, setVibrateMutedState] = useState<boolean>(() => isVibrationMuted());
  const [colorBlind, setColorBlindState]     = useState<boolean>(() => isColorBlindMode());
  const [pushEnabled, setPushEnabled]        = useState<boolean>(() => getStoredPushPref());
  const [pushBusy, setPushBusy]              = useState(false);
  const pushSupported = isPushSupported();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const orientation = useOrientation();

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function toggleChime() {
    const next = !chimeMuted;
    setChimeMutedState(next);
    setChimeMuted(next);
  }
  function toggleVibrate() {
    const next = !vibrateMuted;
    setVibrateMutedState(next);
    setVibrationMuted(next);
  }
  function toggleColorBlind() {
    const next = !colorBlind;
    setColorBlindState(next);
    setColorBlindMode(next);
  }
  async function togglePush() {
    if (!myPlayerId || pushBusy) return;
    setPushBusy(true);
    try {
      if (pushEnabled) {
        await disablePush();
        setPushEnabled(false);
      } else {
        const ok = await enablePush(roomCode, myPlayerId);
        setPushEnabled(ok);
      }
    } finally {
      setPushBusy(false);
    }
  }

  // Closure for closing the popup. In sidebar mode it's a no-op since the
  // panel is always visible — but the menu actions still need to fire their
  // open* callbacks the same way.
  const closePopup = () => { if (!sidebar) setOpen(false); };

  const items = (
    <>
      <MenuItem
        icon="😀"
        label="Stickers"
        onClick={() => { closePopup(); onOpenStickers(); }}
        testId="menu-stickers"
      />
      <MenuItem
        icon="💬"
        label="Quick chat"
        onClick={() => { closePopup(); onOpenQuickChat(); }}
        testId="menu-quickchat"
      />
      <MenuItem
        icon="📜"
        label="Last played"
        onClick={() => { closePopup(); onOpenHistory(); }}
        testId="menu-history"
      />
      <MenuItem
        icon="❓"
        label="How to play"
        onClick={() => { closePopup(); onOpenRules(); }}
        testId="menu-rules"
      />
      <Divider />
      <ToggleItem
        icon="🔄"
        label="Layout rotation"
        value={
          orientation.mode === "auto"
            ? `auto · ${orientation.effective}`
            : orientation.mode
        }
        onClick={orientation.cycle}
        testId="menu-orientation"
      />
      <Divider />
      <ToggleItem
        icon={chimeMuted ? "🔕" : "🔔"}
        label="Your-turn chime"
        value={chimeMuted ? "muted" : "on"}
        onClick={toggleChime}
        testId="menu-chime"
      />
      <ToggleItem
        icon={vibrateMuted ? "📵" : "📳"}
        label="Vibration"
        value={vibrateMuted ? "muted" : "on"}
        onClick={toggleVibrate}
        testId="menu-vibrate"
      />
      <ToggleItem
        icon={colorBlind ? "👁️" : "🎨"}
        label="Color-blind chips"
        value={colorBlind ? "on" : "off"}
        onClick={toggleColorBlind}
        testId="menu-colorblind"
      />
      {pushSupported && myPlayerId && (
        <ToggleItem
          icon={pushEnabled ? "🔔" : "🔕"}
          label="Push when my turn"
          value={pushBusy ? "…" : pushEnabled ? "on" : "off"}
          onClick={togglePush}
          testId="menu-push"
        />
      )}
      {onStopGame && (
        <>
          <Divider />
          <button
            type="button"
            onClick={() => { closePopup(); onStopGame(); }}
            data-testid="menu-stop-game"
            role="menuitem"
            className="state-layer w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-rose-300 hover:bg-rose-500/15 transition-colors font-medium"
          >
            <span className="text-base w-5 text-center">⏹</span>
            <span className="flex-1">Stop game</span>
            <span className="text-rose-400">›</span>
          </button>
        </>
      )}
    </>
  );

  // Sidebar mode: render the list inline (no burger, no popup wrapper).
  // GameScreen places this inside .ff-right-deck on large screens.
  if (sidebar) {
    return (
      <div className="ff-game-menu-sidebar" role="menu" data-testid="game-menu-sidebar">
        {items}
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-40"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 8px)",
        right: "calc(env(safe-area-inset-right, 0px) + 8px)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Game menu"
        aria-label="Open game menu"
        aria-expanded={open}
        data-testid="game-menu-button"
        className="state-layer w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-ff-navy-soft/95 hover:bg-ff-navy-card backdrop-blur border border-ff-navy-ink text-ff-cream shadow-lg flex items-center justify-center"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6"  x2="21" y2="6"  />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {open && (
        <div
          className="overlay-enter absolute right-0 mt-2 w-60 rounded-2xl shadow-2xl border border-ff-navy-ink overflow-hidden"
          style={{ background: "var(--md-surface-1)" }}
          role="menu"
        >
          {items}
        </div>
      )}
    </div>
  );
}

function Divider() {
  return <div className="h-px" style={{ background: "var(--md-outline)" }} />;
}

function MenuItem({
  icon,
  label,
  onClick,
  testId,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      role="menuitem"
      className="state-layer w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-ff-cream hover:bg-ff-navy-card/40 transition-colors"
    >
      <span className="text-base w-5 text-center">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="text-zinc-500">›</span>
    </button>
  );
}

function ToggleItem({
  icon,
  label,
  value,
  onClick,
  testId,
}: {
  icon: string;
  label: string;
  value: string;
  onClick: () => void;
  testId?: string;
}) {
  // "muted" and "off" are both treated as inactive states.
  const isInactive = value === "muted" || value === "off";
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      role="menuitemcheckbox"
      aria-checked={!isInactive}
      className="state-layer w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-ff-cream hover:bg-ff-navy-card/40 transition-colors"
    >
      <span className="text-base w-5 text-center">{icon}</span>
      <span className="flex-1">{label}</span>
      <span
        className={`text-[0.65rem] uppercase tracking-widest font-semibold px-2 py-0.5 rounded-full ${
          isInactive
            ? "bg-ff-navy-card text-zinc-400"
            : "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
        }`}
      >
        {value}
      </span>
    </button>
  );
}

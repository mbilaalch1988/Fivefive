import { useEffect, useRef, useState } from "react";
import {
  isChimeMuted,
  isVibrationMuted,
  setChimeMuted,
  setVibrationMuted,
} from "../lib/notify";

interface Props {
  onOpenStickers: () => void;
  onOpenHistory: () => void;
}

/**
 * Top-right floating menu. Replaces the bottom-left sticker FAB and the
 * bottom-right last-played card — collects everything into one drawer so
 * the playfield stays uncluttered.
 */
export function GameMenu({ onOpenStickers, onOpenHistory }: Props) {
  const [open, setOpen] = useState(false);
  const [chimeMuted, setChimeMutedState]     = useState<boolean>(() => isChimeMuted());
  const [vibrateMuted, setVibrateMutedState] = useState<boolean>(() => isVibrationMuted());
  const menuRef = useRef<HTMLDivElement | null>(null);

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
        className="state-layer w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-zinc-800/95 hover:bg-zinc-700 backdrop-blur border border-zinc-700 text-zinc-100 shadow-lg flex items-center justify-center"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6"  x2="21" y2="6"  />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {open && (
        <div
          className="overlay-enter absolute right-0 mt-2 w-60 rounded-2xl shadow-2xl border border-zinc-700 overflow-hidden"
          style={{ background: "var(--md-surface-1)" }}
          role="menu"
        >
          <MenuItem
            icon="😀"
            label="Stickers"
            onClick={() => { setOpen(false); onOpenStickers(); }}
            testId="menu-stickers"
          />
          <MenuItem
            icon="📜"
            label="Last played"
            onClick={() => { setOpen(false); onOpenHistory(); }}
            testId="menu-history"
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
      className="state-layer w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-zinc-100 hover:bg-zinc-700/40 transition-colors"
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
  const isMuted = value === "muted";
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      role="menuitemcheckbox"
      aria-checked={!isMuted}
      className="state-layer w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-zinc-100 hover:bg-zinc-700/40 transition-colors"
    >
      <span className="text-base w-5 text-center">{icon}</span>
      <span className="flex-1">{label}</span>
      <span
        className={`text-[0.65rem] uppercase tracking-widest font-semibold px-2 py-0.5 rounded-full ${
          isMuted
            ? "bg-zinc-700 text-zinc-400"
            : "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
        }`}
      >
        {value}
      </span>
    </button>
  );
}

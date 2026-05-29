import { useEffect, useState } from "react";
import { Scoreboard } from "../components/Scoreboard";

const NAME_STORAGE_KEY = "sequence.playerName";

interface Props {
  connected: boolean;
  error: string | null;
  onClearError: () => void;
  onCreate: (name: string) => Promise<void>;
  onJoin: (code: string, name: string) => Promise<void>;
}

export function LandingScreen({
  connected,
  error,
  onClearError,
  onCreate,
  onJoin,
}: Props) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);

  // Auto-fill from localStorage on first render.
  useEffect(() => {
    const saved = (() => {
      try { return localStorage.getItem(NAME_STORAGE_KEY) ?? ""; } catch { return ""; }
    })();
    if (saved) setName(saved);
  }, []);

  function saveName(n: string): void {
    try { localStorage.setItem(NAME_STORAGE_KEY, n); } catch { /* ignore */ }
  }

  const canCreate = name.trim().length > 0 && !busy && connected;
  const canJoin = canCreate && code.trim().length > 0;

  async function go(fn: () => Promise<void>) {
    setBusy(true);
    onClearError();
    try {
      await fn();
      saveName(name.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "var(--md-surface)" }}
    >
      <div className="w-full max-w-sm space-y-6">
        <header className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-indigo-500/15 border border-indigo-400/40 mb-2">
            <span className="text-3xl">🂠</span>
          </div>
          <h1 className="text-4xl font-medium tracking-tight">Sequence</h1>
          <p className="text-sm" style={{ color: "var(--md-on-surface-variant)" }}>
            {connected ? "Connected" : "Connecting…"}
          </p>
        </header>

        {error && (
          <div
            role="alert"
            className="bg-rose-500/15 border border-rose-400/40 text-rose-200 rounded-2xl px-4 py-3 text-sm flex items-start justify-between gap-3"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={onClearError}
              className="text-rose-300 hover:text-rose-100 text-xs font-medium uppercase tracking-wider"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Surface card: name + create */}
        <section
          className="rounded-3xl p-5 space-y-4 shadow-sm"
          style={{ background: "var(--md-surface-1)" }}
        >
          <FilledTextField
            label="Your name"
            value={name}
            onChange={setName}
            autoFocus
            maxLength={20}
            placeholder="e.g. Alex"
            testId="name-input"
          />

          <FilledButton
            disabled={!canCreate}
            onClick={() => go(() => onCreate(name.trim()))}
            testId="create-button"
          >
            Create new room
          </FilledButton>
        </section>

        <div className="relative py-1 text-center">
          <span
            className="text-xs uppercase tracking-widest px-3"
            style={{ background: "var(--md-surface)", color: "var(--md-on-surface-variant)" }}
          >
            or
          </span>
          <div
            className="absolute inset-x-0 top-1/2 border-t -z-10"
            style={{ borderColor: "var(--md-outline)" }}
          />
        </div>

        {/* Surface card: join */}
        <section
          className="rounded-3xl p-5 space-y-4 shadow-sm"
          style={{ background: "var(--md-surface-1)" }}
        >
          <FilledTextField
            label="Room code"
            value={code}
            onChange={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            maxLength={6}
            mono
            placeholder="ABCD"
          />
          <TonalButton
            disabled={!canJoin}
            onClick={() => go(() => onJoin(code.trim(), name.trim()))}
          >
            Join room
          </TonalButton>
        </section>

        {/* Scoreboard preview (inline, compact) + full-dialog button */}
        <section
          className="rounded-3xl p-5 space-y-3 shadow-sm"
          style={{ background: "var(--md-surface-1)" }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-widest" style={{ color: "var(--md-on-surface-variant)" }}>
              Hall of fame
            </h2>
            <button
              type="button"
              onClick={() => setScoreboardOpen(true)}
              data-testid="scoreboard-button"
              className="state-layer text-indigo-300 hover:text-indigo-200 text-xs uppercase tracking-widest font-medium px-3 py-1 rounded-full border border-indigo-400/40"
            >
              View all
            </button>
          </div>
          <Scoreboard />
        </section>
      </div>

      {scoreboardOpen && (
        <Scoreboard asDialog onClose={() => setScoreboardOpen(false)} />
      )}
    </main>
  );
}

/* ------------------------------------------------------------ */
/* Material-styled primitives (kept local for cohesion)         */
/* ------------------------------------------------------------ */

function FilledTextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
  mono?: boolean;
  testId?: string;
}) {
  return (
    <label className="block">
      <span
        className="block text-xs font-medium mb-1.5"
        style={{ color: "var(--md-on-surface-variant)" }}
      >
        {props.label}
      </span>
      <input
        type="text"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoFocus={props.autoFocus}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        data-testid={props.testId}
        className={`w-full px-4 py-3 rounded-xl border bg-zinc-900/60 placeholder:text-zinc-600
                    focus:outline-none focus:border-indigo-400 transition-colors
                    ${props.mono ? "font-mono tracking-[0.3em] uppercase" : ""}`}
        style={{ borderColor: "var(--md-outline)" }}
      />
    </label>
  );
}

export function FilledButton(props: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      data-testid={props.testId}
      className="state-layer w-full py-3 rounded-full font-medium text-indigo-50
                 bg-indigo-500 hover:bg-indigo-400 active:bg-indigo-600
                 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed
                 transition-colors shadow-sm shadow-indigo-900/30"
    >
      {props.children}
    </button>
  );
}

export function TonalButton(props: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      data-testid={props.testId}
      className="state-layer w-full py-3 rounded-full font-medium text-indigo-200
                 bg-indigo-500/15 border border-indigo-400/30 hover:bg-indigo-500/25
                 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:border-zinc-700
                 disabled:cursor-not-allowed transition-colors"
    >
      {props.children}
    </button>
  );
}

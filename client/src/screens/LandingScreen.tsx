import { useEffect, useState } from "react";
import { ReplayListDialog } from "../components/ReplayListDialog";
import { Scoreboard } from "../components/Scoreboard";
import { ReplayScreen } from "./ReplayScreen";
import { useAuth } from "../hooks/useAuth";

const NAME_STORAGE_KEY = "sequence.playerName";

interface Props {
  connected: boolean;
  error: string | null;
  onClearError: () => void;
  onCreate: (name: string) => Promise<void>;
  onJoin: (code: string, name: string) => Promise<void>;
  onSpectate: (code: string, name: string) => Promise<void>;
}

export function LandingScreen({
  connected,
  error,
  onClearError,
  onCreate,
  onJoin,
  onSpectate,
}: Props) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showSpectate, setShowSpectate] = useState(false);
  const [replayListOpen, setReplayListOpen] = useState(false);
  const [openReplayId, setOpenReplayId] = useState<string | null>(null);

  const auth = useAuth();

  // Auto-fill name from (a) signed-in profile, otherwise (b) localStorage.
  useEffect(() => {
    if (name) return; // user already typed something
    if (auth.user && auth.displayName) {
      setName(auth.displayName);
      return;
    }
    try {
      const saved = localStorage.getItem(NAME_STORAGE_KEY);
      if (saved) setName(saved);
    } catch { /* ignore */ }
  }, [auth.user, auth.displayName, name]);

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

  async function onSignInGoogle() {
    setAuthError(null);
    const res = await auth.signIn("google");
    if (!res.ok) setAuthError(res.error ?? "sign-in failed");
  }

  return (
    <main
      className="relative min-h-screen flex flex-col items-center justify-center p-4 overflow-hidden"
      style={{ background: "var(--md-surface)" }}
    >
      {/* Drifting colored blobs — purely decorative, sit behind the cards. */}
      <div className="fixed inset-0 -z-0 pointer-events-none">
        <span className="blob blob-1" style={{ top: "-8%", left: "-12%", width: "340px", height: "340px", background: "#a855f7" }} />
        <span className="blob blob-2" style={{ top: "30%", right: "-15%", width: "300px", height: "300px", background: "#ec4899" }} />
        <span className="blob blob-3" style={{ bottom: "-10%", left: "20%", width: "360px", height: "360px", background: "#f59e0b" }} />
        <span className="blob blob-1" style={{ top: "55%", left: "-10%", width: "260px", height: "260px", background: "#22d3ee" }} />
      </div>

      <div className="relative w-full max-w-sm space-y-6">
        <header className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-2 shadow-lg shadow-fuchsia-900/30"
               style={{
                 background: "linear-gradient(135deg, rgba(168,85,247,0.25), rgba(236,72,153,0.25), rgba(245,158,11,0.25))",
                 border: "1px solid rgba(255,255,255,0.15)",
               }}>
            <span className="text-4xl">🂠</span>
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight gradient-text">Sequence</h1>
          <p className="text-sm" style={{ color: "var(--md-on-surface-variant)" }}>
            {connected ? "Connected" : "Connecting…"}
          </p>
        </header>

        {(error || authError) && (
          <div
            role="alert"
            className="bg-rose-500/15 border border-rose-400/40 text-rose-200 rounded-2xl px-4 py-3 text-sm flex items-start justify-between gap-3"
          >
            <span>{error ?? authError}</span>
            <button
              type="button"
              onClick={() => {
                onClearError();
                setAuthError(null);
              }}
              className="text-rose-300 hover:text-rose-100 text-xs font-medium uppercase tracking-wider"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Auth section — only rendered when Supabase is configured */}
        {auth.configured && (
          <section
            className="rounded-3xl p-5 space-y-3 shadow-sm"
            style={{ background: "var(--md-surface-1)" }}
          >
            {auth.user ? (
              <div className="flex items-center gap-3">
                {auth.avatarUrl ? (
                  <img
                    src={auth.avatarUrl}
                    alt=""
                    className="w-10 h-10 rounded-full border border-zinc-700"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-200 font-semibold">
                    {(auth.displayName ?? "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {auth.displayName ?? "Signed in"}
                  </div>
                  <div
                    className="text-xs truncate"
                    style={{ color: "var(--md-on-surface-variant)" }}
                  >
                    {auth.user.email ?? "—"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void auth.signOut()}
                  className="state-layer text-zinc-300 hover:text-white text-xs uppercase tracking-widest font-medium px-3 py-1 rounded-full border border-zinc-700"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void onSignInGoogle()}
                disabled={auth.loading || !connected}
                data-testid="signin-google"
                className="state-layer w-full py-3 rounded-full font-medium text-zinc-100
                           bg-zinc-800 hover:bg-zinc-700 border border-zinc-700
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-colors flex items-center justify-center gap-3"
              >
                <GoogleGlyph />
                <span>Sign in with Google</span>
              </button>
            )}
          </section>
        )}

        {/* Surface card: name + create */}
        <section
          className="rounded-3xl p-5 space-y-4 shadow-sm"
          style={{ background: "var(--md-surface-1)" }}
        >
          <FilledTextField
            label={auth.user ? "Your name (from your account — editable)" : "Your name"}
            value={name}
            onChange={setName}
            autoFocus={!auth.user}
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
          <button
            type="button"
            onClick={() => setShowSpectate((v) => !v)}
            className="state-layer w-full text-xs uppercase tracking-widest text-zinc-400 hover:text-zinc-200 py-1"
          >
            {showSpectate ? "Hide spectate option" : "Just watching? Spectate a game"}
          </button>
          {showSpectate && (
            <button
              type="button"
              data-testid="spectate-button"
              onClick={() =>
                go(() => onSpectate(code.trim(), name.trim() || "Spectator"))
              }
              disabled={!connected || code.trim().length === 0 || busy}
              className="state-layer w-full py-3 rounded-full font-medium text-amber-100
                         bg-amber-500/15 border border-amber-400/40 hover:bg-amber-500/25
                         disabled:bg-zinc-800 disabled:text-zinc-500 disabled:border-zinc-700
                         disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <span>👁</span>
              <span>Spectate room</span>
            </button>
          )}
        </section>

        {/* Scoreboard preview + full-dialog button */}
        <section
          className="rounded-3xl p-5 space-y-3 shadow-sm"
          style={{ background: "var(--md-surface-1)" }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-widest" style={{ color: "var(--md-on-surface-variant)" }}>
              Hall of fame
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setReplayListOpen(true)}
                data-testid="replays-button"
                className="state-layer text-amber-200 hover:text-amber-100 text-xs uppercase tracking-widest font-medium px-3 py-1 rounded-full border border-amber-400/40"
              >
                ▶ Replays
              </button>
              <button
                type="button"
                onClick={() => setScoreboardOpen(true)}
                data-testid="scoreboard-button"
                className="state-layer text-indigo-300 hover:text-indigo-200 text-xs uppercase tracking-widest font-medium px-3 py-1 rounded-full border border-indigo-400/40"
              >
                View all
              </button>
            </div>
          </div>
          <Scoreboard />
        </section>
      </div>

      {scoreboardOpen && (
        <Scoreboard asDialog onClose={() => setScoreboardOpen(false)} />
      )}

      {replayListOpen && !openReplayId && (
        <ReplayListDialog
          onClose={() => setReplayListOpen(false)}
          onOpenReplay={(id) => {
            setReplayListOpen(false);
            setOpenReplayId(id);
          }}
        />
      )}
      {openReplayId && (
        <ReplayScreen
          gameId={openReplayId}
          onClose={() => setOpenReplayId(null)}
        />
      )}
    </main>
  );
}

/* ------------------------------------------------------------ */
/* Local Material primitives + Google glyph                      */
/* ------------------------------------------------------------ */

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <path
        d="M21.35 11.1H12.18v2.96h5.27c-.23 1.4-1.66 4.1-5.27 4.1-3.17 0-5.76-2.62-5.76-5.86s2.59-5.86 5.76-5.86c1.8 0 3.01.77 3.7 1.43l2.52-2.43C16.83 4.06 14.7 3 12.18 3 7 3 2.82 7.18 2.82 12.3S7 21.6 12.18 21.6c7 0 9.34-4.93 9.34-7.94 0-.53-.06-.95-.17-1.56z"
        fill="#fff"
      />
    </svg>
  );
}

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

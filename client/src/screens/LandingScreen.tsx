import { useEffect, useState } from "react";
import { AccountSetup } from "../components/AccountSetup";
import { AuthPanel } from "../components/AuthPanel";
import { ClaimNamePrompt } from "../components/ClaimNamePrompt";
import { InstallPrompt } from "../components/InstallPrompt";
import { ReplayListDialog } from "../components/ReplayListDialog";
import { Scoreboard } from "../components/Scoreboard";
import { ReplayScreen } from "./ReplayScreen";
import { useAccount, type AccountInfo, type AnonymousStats } from "../hooks/useAccount";
import { useAuth } from "../hooks/useAuth";

const NAME_STORAGE_KEY = "sequence.playerName";
const CLAIM_PROMPT_DONE_KEY = "sequence.claimPromptDone";

interface Props {
  connected: boolean;
  error: string | null;
  onClearError: () => void;
  onCreate: (name: string) => Promise<void>;
  onJoin: (code: string, name: string) => Promise<void>;
  onSpectate: (code: string, name: string) => Promise<void>;
}

type ClaimCheckState =
  | { kind: "checking" }
  | { kind: "none" }
  | { kind: "ready"; name: string; stats: AnonymousStats }
  | { kind: "done" };

export function LandingScreen({
  connected,
  error,
  onClearError,
  onCreate,
  onJoin,
  onSpectate,
}: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [showSpectate, setShowSpectate] = useState(false);
  const [spectateName, setSpectateName] = useState("");
  const [replayListOpen, setReplayListOpen] = useState(false);
  const [openReplayId, setOpenReplayId] = useState<string | null>(null);

  const auth = useAuth();
  const account = useAccount(auth.accessToken);
  // Destructure stable refs once so useEffect deps don't churn — useCallback
  // wraps these inside the hook, but `account` as a whole is a fresh object
  // each render which would loop forever.
  const accountStateKind = account.state.kind;
  const { peekAnonymousStats } = account;

  /* ----- Claim-name detection ----- */
  const [claimState, setClaimState] = useState<ClaimCheckState>({ kind: "checking" });
  useEffect(() => {
    if (accountStateKind !== "ready") {
      // Reset when sign-in state changes.
      setClaimState({ kind: "checking" });
      return;
    }
    let cancelled = false;
    try {
      if (localStorage.getItem(CLAIM_PROMPT_DONE_KEY) === "1") {
        setClaimState({ kind: "done" });
        return;
      }
    } catch { /* ignore */ }
    let oldName = "";
    try { oldName = (localStorage.getItem(NAME_STORAGE_KEY) ?? "").trim(); } catch { /* ignore */ }
    if (!oldName) {
      setClaimState({ kind: "none" });
      return;
    }
    void peekAnonymousStats(oldName).then((stats) => {
      if (cancelled) return;
      if (stats) {
        setClaimState({ kind: "ready", name: oldName, stats });
      } else {
        setClaimState({ kind: "none" });
      }
    });
    return () => { cancelled = true; };
  }, [accountStateKind, peekAnonymousStats]);

  function dismissClaimPrompt() {
    try {
      localStorage.setItem(CLAIM_PROMPT_DONE_KEY, "1");
      localStorage.removeItem(NAME_STORAGE_KEY);
    } catch { /* ignore */ }
    setClaimState({ kind: "done" });
  }

  /* ----- Action helpers ----- */
  async function go(fn: () => Promise<void>) {
    setBusy(true);
    onClearError();
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const ready = account.state.kind === "ready";
  const accountRow = account.state.kind === "ready" ? account.state.account : null;
  const displayName = accountRow?.displayName ?? "";

  const canCreate = ready && !busy && connected;
  const canJoin = canCreate && code.trim().length > 0;
  const canSpectate = !busy && connected && code.trim().length > 0;

  return (
    <main
      className="relative min-h-screen flex flex-col items-center justify-center p-4 overflow-hidden"
      style={{ background: "var(--md-surface)" }}
    >
      {/* Drifting colored blobs */}
      <div className="fixed inset-0 -z-0 pointer-events-none">
        <span className="blob blob-1" style={{ top: "-8%", left: "-12%", width: "340px", height: "340px", background: "#a855f7" }} />
        <span className="blob blob-2" style={{ top: "30%", right: "-15%", width: "300px", height: "300px", background: "#ec4899" }} />
        <span className="blob blob-3" style={{ bottom: "-10%", left: "20%", width: "360px", height: "360px", background: "#f59e0b" }} />
        <span className="blob blob-1" style={{ top: "55%", left: "-10%", width: "260px", height: "260px", background: "#22d3ee" }} />
      </div>

      <div className="relative w-full max-w-sm lg:max-w-5xl space-y-6">
        <header className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-2 shadow-lg shadow-fuchsia-900/30"
               style={{
                 background: "linear-gradient(135deg, rgba(168,85,247,0.25), rgba(236,72,153,0.25), rgba(245,158,11,0.25))",
                 border: "1px solid rgba(255,255,255,0.15)",
               }}>
            <span className="text-4xl">🂠</span>
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight gradient-text">Fivefive</h1>
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

        {/* 2-col on lg+; left has auth/setup/play, right has Hall of Fame. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <div className="space-y-6">

        {/* Auth-state gated section. Renders one of:
            - Not signed in       → AuthPanel
            - Signed in, no row   → AccountSetup
            - Ready + claim       → ClaimNamePrompt + ProfileBar
            - Ready (post-claim)  → ProfileBar + Create + Join */}
        {!auth.user ? (
          <AuthPanel />
        ) : account.state.kind === "loading" ? (
          <LoadingPanel />
        ) : account.state.kind === "unauthenticated" ? (
          // auth.user is set (we have a Supabase session) but the server
          // 401'd on /api/accounts/me. The server can't verify the token —
          // almost always means SUPABASE_JWT_SECRET on the server doesn't
          // match the Supabase project's current JWT secret (often after
          // a key rotation). Render an explicit dead-end with a way out.
          <ServerAuthMismatch
            email={auth.user.email ?? null}
            onSignOut={() => void auth.signOut()}
            onRetry={() => void account.refresh()}
          />
        ) : account.state.kind === "needs-setup" ? (
          <AccountSetup
            account={account}
            defaultDisplayName={auth.displayName ?? ""}
            email={auth.user.email ?? null}
            onReady={() => { /* useAccount will flip to "ready" on its own */ }}
            onSignOut={() => void auth.signOut()}
          />
        ) : (
          <>
            {accountRow && (
              <ProfileBar
                account={accountRow}
                onSignOut={() => void auth.signOut()}
                onEditDisplayName={async (n) => account.updateDisplayName(n)}
              />
            )}

            {claimState.kind === "ready" && (
              <ClaimNamePrompt
                anonymousName={claimState.name}
                totalWins={claimState.stats.totalWins}
                totalGames={claimState.stats.totalGames}
                onClaim={async () => {
                  await account.claimName(claimState.name);
                  dismissClaimPrompt();
                }}
                onSkip={dismissClaimPrompt}
              />
            )}

            <section
              className="rounded-3xl p-5 space-y-4 shadow-sm"
              style={{ background: "var(--md-surface-1)" }}
            >
              <p className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>
                You'll join games as{" "}
                <b className="text-zinc-100">{displayName}</b>.
              </p>
              <FilledButton
                disabled={!canCreate}
                onClick={() => go(() => onCreate(displayName))}
                testId="create-button"
              >
                Create new room
              </FilledButton>
            </section>
          </>
        )}

        {/* Divider before the join + spectate row — always visible so
            spectate stays reachable even before sign-in. */}
        <div className="relative py-1 text-center">
          <span
            className="text-xs uppercase tracking-widest px-3"
            style={{ background: "var(--md-surface)", color: "var(--md-on-surface-variant)" }}
          >
            or join a room
          </span>
          <div
            className="absolute inset-x-0 top-1/2 border-t -z-10"
            style={{ borderColor: "var(--md-outline)" }}
          />
        </div>

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
            onClick={() => go(() => onJoin(code.trim(), displayName))}
          >
            {ready ? "Join room" : "Sign in to join"}
          </TonalButton>
          <button
            type="button"
            onClick={() => setShowSpectate((v) => !v)}
            className="state-layer w-full text-xs uppercase tracking-widest text-zinc-400 hover:text-zinc-200 py-1"
          >
            {showSpectate ? "Hide spectate option" : "Just watching? Spectate a game"}
          </button>
          {showSpectate && (
            <div className="space-y-2">
              <FilledTextField
                label="Spectator name (optional)"
                value={spectateName}
                onChange={setSpectateName}
                maxLength={20}
                placeholder="Spectator"
              />
              <button
                type="button"
                data-testid="spectate-button"
                onClick={() =>
                  go(() => onSpectate(code.trim(), spectateName.trim() || "Spectator"))
                }
                disabled={!canSpectate}
                className="state-layer w-full py-3 rounded-full font-medium text-amber-100
                           bg-amber-500/15 border border-amber-400/40 hover:bg-amber-500/25
                           disabled:bg-zinc-800 disabled:text-zinc-500 disabled:border-zinc-700
                           disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <span>👁</span>
                <span>Spectate room</span>
              </button>
            </div>
          )}
        </section>
        </div>

        {/* Right column on lg+: Hall of Fame card. */}
        <div className="space-y-6">
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

        <InstallPrompt />
        </div>
        </div>
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
/* ProfileBar — small chip above Create button                   */
/* ------------------------------------------------------------ */
function ProfileBar({
  account,
  onSignOut,
  onEditDisplayName,
}: {
  account: AccountInfo;
  onSignOut: () => void;
  onEditDisplayName: (name: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(account.displayName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (draft.trim() === account.displayName) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await onEditDisplayName(draft.trim());
      if (!res.ok) {
        setError(res.error ?? "Failed to update");
      } else {
        setEditing(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="rounded-3xl p-4 shadow-sm flex items-center gap-3"
      style={{ background: "var(--md-surface-1)" }}
      data-testid="profile-bar"
    >
      <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-200 font-bold text-sm">
        {account.displayName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") { setEditing(false); setDraft(account.displayName); }
              }}
              maxLength={24}
              className="flex-1 min-w-0 bg-zinc-900/60 rounded-lg px-2 py-1 text-sm border border-zinc-700 focus:outline-none focus:border-indigo-400"
            />
            <button onClick={() => void save()} disabled={busy} className="text-xs text-emerald-300 hover:text-emerald-200 px-2">✓</button>
            <button onClick={() => { setEditing(false); setDraft(account.displayName); }} className="text-xs text-zinc-400 hover:text-zinc-200 px-2">✕</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold truncate">{account.displayName}</span>
              <button
                onClick={() => setEditing(true)}
                title="Edit display name"
                className="text-[0.55rem] uppercase tracking-widest text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-700"
              >
                Edit
              </button>
            </div>
            <div className="text-xs font-mono" style={{ color: "var(--md-on-surface-variant)" }}>
              @{account.username}
            </div>
            {error && <div className="text-[0.65rem] text-rose-300 mt-1">{error}</div>}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onSignOut}
        className="state-layer text-zinc-300 hover:text-white text-xs uppercase tracking-widest font-medium px-3 py-1 rounded-full border border-zinc-700"
      >
        Sign out
      </button>
    </section>
  );
}

/**
 * Shown when the client has a valid Supabase session but the server keeps
 * returning 401 on /api/accounts/me. Almost always SUPABASE_JWT_SECRET on
 * the server is stale (post-rotation) and doesn't match Supabase's
 * current JWT secret.
 */
function ServerAuthMismatch({
  email,
  onSignOut,
  onRetry,
}: {
  email: string | null;
  onSignOut: () => void;
  onRetry: () => void;
}) {
  return (
    <section
      className="rounded-3xl p-5 space-y-4 shadow-sm border"
      style={{
        background: "rgba(244, 63, 94, 0.08)",
        borderColor: "rgba(244, 63, 94, 0.4)",
      }}
      data-testid="server-auth-mismatch"
    >
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-rose-500/20 border border-rose-400/40 flex items-center justify-center text-lg shrink-0">
          ⚠️
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest font-semibold text-rose-200">
            Server can't verify your sign-in
          </div>
          <h2 className="text-base font-medium tracking-tight mt-1">
            Account temporarily unreachable
          </h2>
        </div>
      </header>
      <p className="text-sm text-zinc-200 leading-snug">
        You're signed in as <b>{email ?? "your account"}</b>, but our server
        rejected the credentials. This usually means the server's JWT secret
        was just rotated and needs a moment to sync.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSignOut}
          className="state-layer flex-1 py-2.5 rounded-full font-medium text-zinc-200
                     bg-transparent border border-zinc-700 hover:border-zinc-500
                     transition-colors text-sm"
        >
          Sign out
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="state-layer flex-1 py-2.5 rounded-full font-medium text-white
                     bg-rose-500 hover:bg-rose-400 transition-colors text-sm"
        >
          Retry
        </button>
      </div>
    </section>
  );
}

function LoadingPanel() {
  return (
    <section
      className="rounded-3xl p-5 shadow-sm flex items-center justify-center"
      style={{ background: "var(--md-surface-1)", minHeight: "8rem" }}
    >
      <div className="h-8 w-8 rounded-full animate-pulse" style={{ background: "var(--md-surface-2)" }} />
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Local Material primitives                                     */
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

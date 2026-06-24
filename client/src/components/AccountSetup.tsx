import { useEffect, useRef, useState } from "react";
import type { UseAccount } from "../hooks/useAccount";

interface Props {
  account: UseAccount;
  defaultDisplayName?: string;
  /** Called after register succeeds — caller decides what to do next (e.g.,
   *  prompt the claim flow if a localStorage anon name exists). */
  onReady: () => void;
  /** Allow the user to sign out from the setup screen if they want to use a
   *  different auth method. */
  onSignOut?: () => void;
  /** Email address pulled from the Supabase session, attached to the row. */
  email: string | null;
}

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const DEBOUNCE_MS = 300;

/**
 * First-time account setup. Shown after Supabase auth completes but before
 * the user can play, when no `accounts` row exists yet. Picks an immutable
 * username (with live availability check) and a changeable display name.
 */
export function AccountSetup({ account, defaultDisplayName, onReady, onSignOut, email }: Props) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(defaultDisplayName ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<{
    state: "idle" | "checking" | "available" | "taken" | "invalid";
    forUsername: string;
  }>({ state: "idle", forUsername: "" });

  // Pluck the stable function ref so useEffect doesn't loop when the whole
  // `account` hook return is a fresh object per render.
  const { checkUsername } = account;

  // Debounced username availability check.
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    const u = username.trim().toLowerCase();
    if (u.length === 0) {
      setAvailability({ state: "idle", forUsername: "" });
      return;
    }
    if (!USERNAME_RE.test(u)) {
      setAvailability({ state: "invalid", forUsername: u });
      return;
    }
    setAvailability({ state: "checking", forUsername: u });
    debounceRef.current = window.setTimeout(async () => {
      const ok = await checkUsername(u);
      setAvailability({
        state: ok ? "available" : "taken",
        forUsername: u,
      });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [username, checkUsername]);

  // Default display name to username if user hasn't typed one yet.
  useEffect(() => {
    if (displayName.trim().length === 0 && username.trim().length > 0) {
      setDisplayName(username.trim());
    }
  }, [username, displayName]);

  const canSubmit =
    !submitting &&
    availability.state === "available" &&
    displayName.trim().length > 0 &&
    displayName.trim().length <= 24;

  async function go() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await account.register({
        username: username.trim().toLowerCase(),
        displayName: displayName.trim(),
        email,
      });
      if (!res.ok) {
        setError(res.error ?? "Failed to create account.");
      } else {
        onReady();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="rounded-3xl p-5 space-y-4 shadow-sm"
      style={{ background: "var(--md-surface-1)" }}
      data-testid="account-setup"
    >
      <header className="space-y-1">
        <div
          className="text-xs uppercase tracking-widest font-semibold"
          style={{ color: "var(--md-on-surface-variant)" }}
        >
          One more step
        </div>
        <h2 className="text-lg font-medium tracking-tight">Pick your username</h2>
        <p className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>
          Your username is your unique handle on leaderboards. Your display
          name is what other players see in games — you can change it anytime.
        </p>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); void go(); }}
        className="space-y-3"
      >
        {/* Username */}
        <label className="block">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--md-on-surface-variant)" }}>
              Username
            </span>
            <UsernameStatus state={availability.state} matchingInput={availability.forUsername === username.trim().toLowerCase()} />
          </div>
          <div className="flex items-center gap-2 rounded-xl border bg-zinc-900/60 px-3 py-2.5 focus-within:border-indigo-400 transition-colors"
               style={{ borderColor: "var(--md-outline)" }}>
            <span className="text-zinc-500 font-mono">@</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              autoFocus
              autoComplete="off"
              placeholder="ayesha"
              maxLength={20}
              data-testid="account-setup-username"
              className="flex-1 bg-transparent placeholder:text-zinc-600 focus:outline-none font-mono"
            />
          </div>
          <div className="text-[0.6rem] mt-1" style={{ color: "var(--md-on-surface-variant)" }}>
            3–20 chars · lowercase letters, numbers, underscore
          </div>
        </label>

        {/* Display name */}
        <label className="block">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--md-on-surface-variant)" }}>
              Display name
            </span>
            <span className="text-[0.6rem]" style={{ color: "var(--md-on-surface-variant)" }}>
              shown in games · editable later
            </span>
          </div>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ayesha"
            maxLength={24}
            data-testid="account-setup-displayname"
            className="w-full px-4 py-2.5 rounded-xl border bg-zinc-900/60 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-400 transition-colors"
            style={{ borderColor: "var(--md-outline)" }}
          />
        </label>

        {error && (
          <div className="text-xs px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-400/40 text-rose-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          data-testid="account-setup-submit"
          className="state-layer w-full py-3 rounded-full font-medium text-indigo-50
                     bg-indigo-500 hover:bg-indigo-400 active:bg-indigo-600
                     disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed
                     transition-colors shadow-sm shadow-indigo-900/30"
        >
          {submitting ? "Creating…" : "Create account"}
        </button>

        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="state-layer w-full text-xs uppercase tracking-widest text-zinc-400 hover:text-zinc-200 py-1"
          >
            Sign out and try a different method
          </button>
        )}
      </form>
    </section>
  );
}

type StatusKind = "idle" | "checking" | "available" | "taken" | "invalid";

function UsernameStatus({
  state,
  matchingInput,
}: {
  state: StatusKind;
  matchingInput: boolean;
}) {
  if (state === "idle") return null;
  // Avoid flashing stale results while the user is mid-type.
  if (!matchingInput && state !== "invalid") return null;
  const map: Record<StatusKind, { text: string; cls: string }> = {
    idle:       { text: "",                cls: "" },
    checking:   { text: "Checking…",       cls: "text-zinc-400" },
    available:  { text: "✓ Available",     cls: "text-emerald-300" },
    taken:      { text: "✕ Taken",         cls: "text-rose-300" },
    invalid:    { text: "Invalid format",  cls: "text-amber-300" },
  };
  const v = map[state];
  return <span className={`text-[0.6rem] uppercase tracking-widest font-semibold ${v.cls}`}>{v.text}</span>;
}

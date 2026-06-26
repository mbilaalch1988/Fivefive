import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

interface Props {
  /** Inline error to surface (e.g., room-create failures). */
  errorAbove?: string | null;
  onClearError?: () => void;
}

type Tab = "signin" | "signup";
type Banner =
  | { kind: "verify"; email: string }
  | { kind: "reset_sent"; email: string }
  | { kind: "error"; msg: string }
  | null;

/**
 * Account panel for the landing screen. Tabs for sign-in vs sign-up,
 * email+password forms in each, Google as a secondary option below.
 * Displays a "check your email" banner after sign-up or password-reset
 * requests.
 *
 * When the user is already signed in, this collapses to a small profile
 * row with a sign-out button — same as the previous LandingScreen behavior.
 */
export function AuthPanel({ errorAbove, onClearError }: Props) {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  if (!auth.configured) return null;

  // Signed-in compact profile row.
  if (auth.user) {
    return (
      <section className="ff-sticker p-5">
        <div className="flex items-center gap-3">
          {auth.avatarUrl ? (
            <img
              src={auth.avatarUrl}
              alt=""
              className="w-11 h-11 rounded-full border-[3px] border-ff-navy-ink shadow-[2px_2px_0_var(--ff-navy-ink)]"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-ff-coral border-[3px] border-ff-navy-ink shadow-[2px_2px_0_var(--ff-navy-ink)] flex items-center justify-center text-ff-cream font-bold text-lg">
              {(auth.displayName ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate text-ff-cream">
              {auth.displayName ?? "Signed in"}
            </div>
            <div className="text-xs truncate text-ff-gold/80 font-mono">
              {auth.user.email ?? "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void auth.signOut()}
            className="state-layer text-ff-cream text-xs uppercase tracking-widest font-bold px-3 py-1.5 rounded-full border-2 border-ff-gold/70 hover:bg-ff-gold/15 transition-colors"
          >
            Sign out
          </button>
        </div>
      </section>
    );
  }

  // Not signed in — show full sign-in / sign-up panel.
  const canSubmit = email.trim().length > 0 && password.length >= 6 && !busy;

  async function go() {
    if (!canSubmit) return;
    setBusy(true);
    setBanner(null);
    onClearError?.();
    try {
      if (tab === "signin") {
        const res = await auth.signInWithEmail(email.trim(), password);
        if (!res.ok) setBanner({ kind: "error", msg: res.error });
        // Successful sign-in: the useAuth subscription updates the parent.
      } else {
        const res = await auth.signUpWithEmail(email.trim(), password);
        if (!res.ok) {
          setBanner({ kind: "error", msg: res.error });
        } else if (res.needsVerification) {
          setBanner({ kind: "verify", email: email.trim() });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBanner(null);
    onClearError?.();
    const res = await auth.signIn("google");
    if (!res.ok) setBanner({ kind: "error", msg: res.error });
  }

  async function onForgotPassword() {
    if (!email.trim()) {
      setBanner({ kind: "error", msg: "Enter your email above first." });
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const res = await auth.requestPasswordReset(email.trim());
      if (!res.ok) setBanner({ kind: "error", msg: res.error });
      else setBanner({ kind: "reset_sent", email: email.trim() });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="ff-sticker p-5 space-y-4"
      data-testid="auth-panel"
    >
      {/* Tabs — sit on a darker navy track so the active gold pill clearly pops. */}
      <div className="flex rounded-full p-1 bg-ff-navy border-2 border-ff-navy-ink">
        <TabButton label="Sign in" active={tab === "signin"} onClick={() => setTab("signin")} />
        <TabButton label="Sign up" active={tab === "signup"} onClick={() => setTab("signup")} />
      </div>

      {/* Banner / error */}
      {errorAbove && (
        <div className="text-xs px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-400/40 text-rose-200">
          {errorAbove}
        </div>
      )}
      {banner && <BannerCard banner={banner} onDismiss={() => setBanner(null)} />}

      {/* Email + password */}
      <form
        onSubmit={(e) => { e.preventDefault(); void go(); }}
        className="space-y-3"
      >
        <FieldLabel label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            data-testid="auth-email"
            className="w-full px-4 py-2.5 rounded-xl border-[2.5px] border-ff-navy-ink bg-ff-navy
                       text-ff-cream placeholder:text-ff-cream/30
                       focus:outline-none focus:border-ff-gold transition-colors
                       shadow-[2px_2px_0_var(--ff-navy-ink)]"
          />
        </FieldLabel>
        <FieldLabel label="Password" hint="At least 6 characters">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={tab === "signin" ? "current-password" : "new-password"}
            placeholder="••••••••"
            minLength={6}
            data-testid="auth-password"
            className="w-full px-4 py-2.5 rounded-xl border-[2.5px] border-ff-navy-ink bg-ff-navy
                       text-ff-cream placeholder:text-ff-cream/30
                       focus:outline-none focus:border-ff-gold transition-colors
                       shadow-[2px_2px_0_var(--ff-navy-ink)]"
          />
        </FieldLabel>

        <button
          type="submit"
          disabled={!canSubmit}
          data-testid="auth-submit"
          className="state-layer ff-pill ff-pill--gold w-full py-3 font-bold text-base
                     disabled:bg-ff-navy-soft disabled:text-ff-cream/40 disabled:cursor-not-allowed
                     disabled:hover:translate-x-0 disabled:hover:translate-y-0"
        >
          {busy ? "…" : tab === "signin" ? "Sign in" : "Create account"}
        </button>

        {tab === "signin" && (
          <button
            type="button"
            onClick={() => void onForgotPassword()}
            disabled={busy}
            className="state-layer w-full text-xs uppercase tracking-widest font-semibold text-ff-gold/80 hover:text-ff-gold py-1"
          >
            Forgot password?
          </button>
        )}
        {tab === "signup" && (
          <p
            className="text-[0.65rem] text-center"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            We'll email a verification link. Click it to finish setup.
          </p>
        )}
      </form>

      {/* "or" divider — span bg matches the .ff-sticker panel (navy-card). */}
      <div className="relative py-1 text-center">
        <span className="text-xs uppercase tracking-widest font-bold px-3 text-ff-gold bg-ff-navy-card">
          or
        </span>
        <div className="absolute inset-x-0 top-1/2 border-t-2 border-ff-navy-ink/60 -z-10" />
      </div>

      <button
        type="button"
        onClick={() => void onGoogle()}
        disabled={auth.loading || busy}
        data-testid="signin-google"
        className="state-layer ff-pill w-full py-2.5 font-bold text-white
                   bg-[#ea4335] hover:bg-[#d33b2c] active:bg-[#b8302a]
                   disabled:opacity-50 disabled:cursor-not-allowed
                   flex items-center justify-center gap-3"
      >
        <GoogleGlyph />
        <span>Continue with Google</span>
      </button>
    </section>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`auth-tab-${label.toLowerCase().replace(" ", "")}`}
      aria-pressed={active}
      className={`flex-1 py-2 rounded-full text-sm font-bold transition-all ${
        active
          ? "bg-ff-gold text-ff-navy border-2 border-ff-navy-ink shadow-[2px_2px_0_var(--ff-navy-ink)]"
          : "text-ff-cream/70 hover:text-ff-cream"
      }`}
    >
      {label}
    </button>
  );
}

function FieldLabel({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span
          className="text-xs font-medium"
          style={{ color: "var(--md-on-surface-variant)" }}
        >
          {label}
        </span>
        {hint && (
          <span
            className="text-[0.6rem]"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            {hint}
          </span>
        )}
      </div>
      {children}
    </label>
  );
}

function BannerCard({ banner, onDismiss }: { banner: Banner; onDismiss: () => void }) {
  if (!banner) return null;
  if (banner.kind === "verify") {
    return (
      <div className="text-xs px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-400/40 text-emerald-200 flex items-start gap-2">
        <span className="text-base shrink-0">📧</span>
        <div className="flex-1">
          <div className="font-semibold">Check your inbox</div>
          <div className="opacity-90">
            We sent a verification link to <b>{banner.email}</b>. Click it to finish setup.
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-emerald-300 hover:text-emerald-100 text-[0.65rem] uppercase tracking-widest"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    );
  }
  if (banner.kind === "reset_sent") {
    return (
      <div className="text-xs px-3 py-2.5 rounded-xl bg-ff-gold/10 border border-ff-gold/40 text-ff-cream flex items-start gap-2">
        <span className="text-base shrink-0">🔑</span>
        <div className="flex-1">
          <div className="font-semibold">Reset link sent</div>
          <div className="opacity-90">
            Open the email at <b>{banner.email}</b> to set a new password.
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-ff-gold hover:text-ff-cream text-[0.65rem] uppercase tracking-widest"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    );
  }
  return (
    <div className="text-xs px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-400/40 text-rose-200 flex items-start justify-between gap-2">
      <span>{banner.msg}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-rose-300 hover:text-rose-100 text-[0.65rem] uppercase tracking-widest"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

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

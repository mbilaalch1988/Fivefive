import { useState } from "react";

interface Props {
  anonymousName: string;
  totalWins: number;
  totalGames: number;
  onClaim: () => Promise<void>;
  onSkip: () => void;
}

/**
 * Post-account-setup prompt offering to merge an unclaimed anonymous
 * player_stats row into the freshly-created account. Shown once per
 * (account, anonymous-name) pair — dismissed by either action.
 */
export function ClaimNamePrompt({ anonymousName, totalWins, totalGames, onClaim, onSkip }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await onClaim();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

  return (
    <section
      className="rounded-3xl p-5 space-y-4 shadow-sm border"
      style={{
        background: "rgba(168, 85, 247, 0.08)",
        borderColor: "rgba(168, 85, 247, 0.4)",
      }}
      data-testid="claim-name-prompt"
    >
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-fuchsia-500/20 border border-fuchsia-400/40 flex items-center justify-center text-lg shrink-0">
          🪪
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-widest font-semibold text-fuchsia-200">
            Welcome back, looks like you have history here
          </div>
          <h2 className="text-base font-medium tracking-tight mt-1">
            Link your guest stats?
          </h2>
        </div>
      </header>

      <p className="text-sm text-zinc-200 leading-snug">
        You previously played as <b className="text-fuchsia-200">"{anonymousName}"</b>{" "}
        and racked up <b>{totalWins}</b> win{totalWins === 1 ? "" : "s"} across{" "}
        <b>{totalGames}</b> game{totalGames === 1 ? "" : "s"} ({winRate}% win rate).
      </p>
      <p className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>
        Link those stats to your new account so they count toward your
        achievements and leaderboard ranking. This is a one-time choice.
      </p>

      {error && (
        <div className="text-xs px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-400/40 text-rose-200">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          data-testid="claim-skip"
          className="state-layer flex-1 py-2.5 rounded-full font-medium text-zinc-300
                     bg-transparent border border-zinc-700 hover:border-zinc-500
                     transition-colors text-sm"
        >
          No thanks
        </button>
        <button
          type="button"
          onClick={() => void go()}
          disabled={busy}
          data-testid="claim-confirm"
          className="state-layer flex-1 py-2.5 rounded-full font-medium text-white
                     bg-fuchsia-500 hover:bg-fuchsia-400 disabled:bg-zinc-700 disabled:text-zinc-500
                     transition-colors text-sm shadow-sm shadow-fuchsia-900/30"
        >
          {busy ? "Linking…" : "Link them to me"}
        </button>
      </div>
    </section>
  );
}

import { useCallback, useEffect, useState } from "react";

/**
 * Server-side `accounts` row — the user's display identity that lives
 * alongside their Supabase auth user. Created via /api/accounts/register
 * after Supabase auth completes.
 */
export interface AccountInfo {
  userId: string;
  username: string;
  displayName: string;
  email: string | null;
}

export type AccountState =
  /** Initial mount / waiting for token. */
  | { kind: "loading" }
  /** Auth not configured OR not signed in — no account either way. */
  | { kind: "unauthenticated" }
  /** Signed in but no accounts row yet — needs the setup flow. */
  | { kind: "needs-setup" }
  /** Fully provisioned. */
  | { kind: "ready"; account: AccountInfo };

export interface AnonymousStats {
  totalWins: number;
  totalGames: number;
}

export interface UseAccount {
  state: AccountState;
  /** Live availability check for sign-up. */
  checkUsername: (username: string) => Promise<boolean>;
  /** Create the accounts row after Supabase auth completes. */
  register: (input: {
    username: string;
    displayName: string;
    email: string | null;
  }) => Promise<{ ok: boolean; error?: string }>;
  /** Change display name (username is immutable). */
  updateDisplayName: (displayName: string) => Promise<{ ok: boolean; error?: string }>;
  /** Peek anonymous stats for a name (for the claim prompt). */
  peekAnonymousStats: (name: string) => Promise<AnonymousStats | null>;
  /** Roll an anonymous player's lifetime stats into the current account. */
  claimName: (name: string) => Promise<{ ok: boolean; error?: string }>;
  /** Force re-fetch — call after a successful register/claim. */
  refresh: () => Promise<void>;
}

const ASSET_BASE =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? "http://localhost:3001" : "");

/**
 * Hook that mirrors the server's account row. Pass the Supabase access
 * token from useAuth; the hook silently re-fetches whenever it changes
 * (so post-sign-in the account row appears automatically).
 */
export function useAccount(accessToken: string | null): UseAccount {
  const [state, setState] = useState<AccountState>({ kind: "loading" });

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setState({ kind: "unauthenticated" });
      return;
    }
    try {
      const r = await fetch(`${ASSET_BASE}/api/accounts/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.status === 401) {
        setState({ kind: "unauthenticated" });
        return;
      }
      if (!r.ok) {
        // Network or server error — treat as needs-setup so user can retry.
        setState({ kind: "needs-setup" });
        return;
      }
      const data = (await r.json()) as { account: AccountInfo | null };
      if (data.account) {
        setState({ kind: "ready", account: data.account });
      } else {
        setState({ kind: "needs-setup" });
      }
    } catch {
      setState({ kind: "needs-setup" });
    }
  }, [accessToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const checkUsername = useCallback(
    async (username: string) => {
      try {
        const r = await fetch(
          `${ASSET_BASE}/api/accounts/check-username?username=${encodeURIComponent(username)}`,
        );
        if (!r.ok) return false;
        const data = (await r.json()) as { available: boolean };
        return data.available;
      } catch {
        return false;
      }
    },
    [],
  );

  const register = useCallback(
    async (input: { username: string; displayName: string; email: string | null }) => {
      if (!accessToken) return { ok: false, error: "not signed in" };
      try {
        const r = await fetch(`${ASSET_BASE}/api/accounts/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(input),
        });
        const data = (await r.json()) as { account?: AccountInfo; error?: string };
        if (!r.ok || data.error) {
          return { ok: false, error: data.error ?? `error ${r.status}` };
        }
        if (data.account) {
          setState({ kind: "ready", account: data.account });
        } else {
          await refresh();
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    [accessToken, refresh],
  );

  const updateDisplayName = useCallback(
    async (displayName: string) => {
      if (!accessToken) return { ok: false, error: "not signed in" };
      try {
        const r = await fetch(`${ASSET_BASE}/api/accounts/me`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ displayName }),
        });
        const data = (await r.json()) as { account?: AccountInfo; error?: string };
        if (!r.ok || data.error) {
          return { ok: false, error: data.error ?? `error ${r.status}` };
        }
        if (data.account) {
          setState({ kind: "ready", account: data.account });
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    [accessToken],
  );

  const peekAnonymousStats = useCallback(async (name: string) => {
    try {
      const r = await fetch(
        `${ASSET_BASE}/api/accounts/anonymous-stats?name=${encodeURIComponent(name)}`,
      );
      if (!r.ok) return null;
      const data = (await r.json()) as { stats: AnonymousStats | null };
      return data.stats;
    } catch {
      return null;
    }
  }, []);

  const claimName = useCallback(
    async (name: string) => {
      if (!accessToken) return { ok: false, error: "not signed in" };
      try {
        const r = await fetch(`${ASSET_BASE}/api/accounts/claim-name`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ name }),
        });
        const data = (await r.json()) as { claimed?: boolean; error?: string };
        if (!r.ok || data.error) {
          return { ok: false, error: data.error ?? `error ${r.status}` };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    [accessToken],
  );

  return {
    state,
    checkUsername,
    register,
    updateDisplayName,
    peekAnonymousStats,
    claimName,
    refresh,
  };
}

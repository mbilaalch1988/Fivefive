import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, isAuthConfigured } from "../lib/supabase";

export type OAuthProvider = "google" | "azure" | "facebook";

export interface UseAuth {
  /** True when VITE_SUPABASE_* env vars are set — i.e., auth is wired. */
  configured: boolean;
  /** Initial session restore in flight. */
  loading: boolean;
  user: User | null;
  /** Convenience: the best name we can pull from the OAuth profile. */
  displayName: string | null;
  /** Convenience: the avatar URL if the provider returned one. */
  avatarUrl: string | null;
  signIn: (provider: OAuthProvider) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuth {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(isAuthConfigured);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (provider: OAuthProvider) => {
      if (!supabase) return { ok: false, error: "auth not configured" };
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    [],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  return {
    configured: isAuthConfigured,
    loading,
    user,
    displayName: user
      ? pickDisplayName(user.user_metadata, user.email)
      : null,
    avatarUrl: user
      ? (user.user_metadata?.avatar_url as string | undefined) ??
        (user.user_metadata?.picture as string | undefined) ??
        null
      : null,
    signIn,
    signOut,
  };
}

function pickDisplayName(
  meta: Record<string, unknown> | undefined,
  email: string | undefined,
): string {
  if (meta) {
    for (const key of ["full_name", "name", "user_name", "preferred_username"]) {
      const v = meta[key];
      if (typeof v === "string" && v.trim().length > 0) return v.trim();
    }
  }
  if (email) return email.split("@")[0] ?? email;
  return "";
}

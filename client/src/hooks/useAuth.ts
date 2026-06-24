import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, isAuthConfigured } from "../lib/supabase";

export type OAuthProvider = "google" | "azure" | "facebook";

export type AuthResult =
  | { ok: true; needsVerification?: boolean }
  | { ok: false; error: string };

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
  /** Current JWT access token, suitable for passing to the server. */
  accessToken: string | null;
  signIn: (provider: OAuthProvider) => Promise<AuthResult>;
  /** Email + password sign-in (Supabase). Returns { needsVerification }
   *  if Supabase rejects an unverified email login. */
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  /** Email + password sign-up — sends a verification email. The session is
   *  NOT established until the user clicks the link. */
  signUpWithEmail: (email: string, password: string) => Promise<AuthResult>;
  /** Trigger Supabase password reset. They click email link → reset page. */
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuth {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(isAuthConfigured);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(data.session?.user ?? null);
      setAccessToken(data.session?.access_token ?? null);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAccessToken(session?.access_token ?? null);
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (provider: OAuthProvider): Promise<AuthResult> => {
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

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!supabase) return { ok: false, error: "auth not configured" };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // Supabase returns "Email not confirmed" when verification is pending.
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("confirm")) {
          return { ok: false, error: "Verify your email first — check your inbox." };
        }
        return { ok: false, error: error.message };
      }
      return { ok: true };
    },
    [],
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!supabase) return { ok: false, error: "auth not configured" };
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) return { ok: false, error: error.message };
      // session is null when verification is required (the default Supabase
      // setting for new projects).
      const needsVerification = !data.session;
      return { ok: true, needsVerification };
    },
    [],
  );

  const requestPasswordReset = useCallback(
    async (email: string): Promise<AuthResult> => {
      if (!supabase) return { ok: false, error: "auth not configured" };
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
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
    accessToken,
    signIn,
    signInWithEmail,
    signUpWithEmail,
    requestPasswordReset,
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

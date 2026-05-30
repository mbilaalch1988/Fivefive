import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for OAuth auth. Created only when both env vars are present
 * — if Supabase isn't configured yet, the rest of the app continues to work
 * (anonymous play path) and the auth UI hides itself.
 *
 * VITE_SUPABASE_URL: https://<project-ref>.supabase.co
 * VITE_SUPABASE_ANON_KEY: the public anon key (NOT the service-role key).
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;
if (url && anonKey) {
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      autoRefreshToken: true,
      flowType: "pkce",
    },
  });
}

export const supabase: SupabaseClient | null = client;
export const isAuthConfigured = client !== null;

import jwt from "jsonwebtoken";

/**
 * Verify a Supabase access token and extract the immutable user id + the best
 * display name we can find in the JWT claims. Returns null on invalid/expired
 * tokens or when SUPABASE_JWT_SECRET isn't set (so the server gracefully
 * falls back to anonymous identity).
 *
 * Supabase JWTs are HS256-signed with the project JWT Secret. Find it at:
 * Supabase → Settings → API → JWT Secret. Set it on Render as
 * SUPABASE_JWT_SECRET.
 */
export interface VerifiedUser {
  userId: string;
  displayName: string;
}

const SECRET = process.env.SUPABASE_JWT_SECRET;

let warnedNoSecret = false;

export function verifyToken(token: string | undefined): VerifiedUser | null {
  if (!token) return null;
  if (!SECRET) {
    if (!warnedNoSecret) {
      console.warn(
        "[jwt] SUPABASE_JWT_SECRET not set — auth tokens will be ignored, all players treated as anonymous",
      );
      warnedNoSecret = true;
    }
    return null;
  }
  try {
    const decoded = jwt.verify(token, SECRET) as Record<string, unknown>;
    const userId = decoded.sub as string | undefined;
    if (!userId) return null;
    const meta = (decoded.user_metadata as Record<string, unknown> | undefined) ?? {};
    const displayName = pickName(meta, decoded.email as string | undefined) || "Player";
    return { userId, displayName };
  } catch (e) {
    console.warn("[jwt] verify failed:", (e as Error).message);
    return null;
  }
}

function pickName(
  meta: Record<string, unknown>,
  email: string | undefined,
): string {
  for (const k of ["full_name", "name", "user_name", "preferred_username"]) {
    const v = meta[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  if (email) return email.split("@")[0] ?? email;
  return "";
}

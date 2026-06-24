import {
  createRemoteJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
} from "jose";

/**
 * Verify a Supabase access token and extract the immutable user id + the best
 * display name we can find in the JWT claims. Returns null on invalid/expired
 * tokens or when the server can't verify (so callers gracefully fall back to
 * anonymous identity).
 *
 * Supabase signs tokens two ways depending on project vintage:
 *   - Legacy: HS256 with the project JWT Secret (SUPABASE_JWT_SECRET env).
 *   - New:    Asymmetric (RS256 / ES256 / EdDSA) — public keys served at
 *             <project>/auth/v1/.well-known/jwks.json.
 *
 * We inspect the JWT header's `alg` and dispatch accordingly. JWKS responses
 * are cached per-issuer via createRemoteJWKSet so we don't refetch on every
 * request.
 */

export interface VerifiedUser {
  userId: string;
  displayName: string;
}

const SECRET = process.env.SUPABASE_JWT_SECRET;
const SECRET_BYTES = SECRET ? new TextEncoder().encode(SECRET) : null;

let warnedNoSecret = false;

/** issuer URL → cached JWKS fetcher. */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwksForIssuer(issuer: string) {
  let jwks = jwksCache.get(issuer);
  if (jwks) return jwks;
  // Supabase serves JWKS at <issuer>/.well-known/jwks.json
  // where issuer = https://<project-ref>.supabase.co/auth/v1
  const jwksUrl = new URL(`${issuer.replace(/\/$/, "")}/.well-known/jwks.json`);
  jwks = createRemoteJWKSet(jwksUrl, {
    cacheMaxAge: 10 * 60 * 1000, // 10 minutes
  });
  jwksCache.set(issuer, jwks);
  return jwks;
}

export async function verifyToken(token: string | undefined): Promise<VerifiedUser | null> {
  if (!token) return null;
  try {
    const header = decodeProtectedHeader(token);
    const alg = header.alg ?? "";

    let payload: JWTPayload;
    if (alg.startsWith("HS")) {
      // Legacy symmetric signing — need the project JWT secret.
      if (!SECRET_BYTES) {
        if (!warnedNoSecret) {
          console.warn(
            "[jwt] SUPABASE_JWT_SECRET not set — HS-signed tokens cannot be verified",
          );
          warnedNoSecret = true;
        }
        return null;
      }
      ({ payload } = await jwtVerify(token, SECRET_BYTES, {
        algorithms: ["HS256"],
      }));
    } else {
      // Asymmetric — derive issuer from the token payload and pull its JWKS.
      const claims = decodeJwt(token);
      const issuer = typeof claims.iss === "string" ? claims.iss : null;
      if (!issuer) {
        console.warn("[jwt] no issuer claim — can't fetch JWKS");
        return null;
      }
      const jwks = getJwksForIssuer(issuer);
      ({ payload } = await jwtVerify(token, jwks, {
        issuer,
        algorithms: ["RS256", "ES256", "EdDSA"],
      }));
    }

    const userId = typeof payload.sub === "string" ? payload.sub : null;
    if (!userId) return null;
    const meta = (payload.user_metadata as Record<string, unknown> | undefined) ?? {};
    const email = typeof payload.email === "string" ? payload.email : undefined;
    const displayName = pickName(meta, email) || "Player";
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

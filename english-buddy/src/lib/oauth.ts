import { createHmac, createPrivateKey, randomBytes, randomUUID, sign as cryptoSign } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { safeEqual } from "@/lib/auth";

/**
 * Social sign-in (Google OIDC + Sign in with Apple), implemented directly on
 * the providers' endpoints — no extra dependencies. Each provider activates
 * when its env vars are present; the UI hides the buttons otherwise.
 */

export function baseUrl() {
  return (process.env.APP_BASE_URL || "https://www.execlingo.it").replace(/\/$/, "");
}

export function googleEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function appleEnabled() {
  return Boolean(
    process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY
  );
}

/* ---- CSRF state: HMAC-signed timestamp, no cookie needed (works with Apple's cross-site form_post) ---- */

function stateSecret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return value;
}

export function createOauthState(now = Date.now()): string {
  const payload = `${now}.${randomBytes(8).toString("hex")}`;
  const signature = createHmac("sha256", stateSecret()).update(`oauth-state:${payload}`).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyOauthState(state: string | null, maxAgeMs = 10 * 60_000, now = Date.now()): boolean {
  if (!state) return false;
  const lastDot = state.lastIndexOf(".");
  if (lastDot <= 0) return false;
  const payload = state.slice(0, lastDot);
  const signature = state.slice(lastDot + 1);
  const expected = createHmac("sha256", stateSecret()).update(`oauth-state:${payload}`).digest("hex");
  if (!safeEqual(signature, expected)) return false;
  const timestamp = Number(payload.split(".")[0]);
  return Number.isFinite(timestamp) && now - timestamp < maxAgeMs;
}

/* ---- Account resolution ---- */

/**
 * Finds or creates the account for a verified provider identity. Matching
 * order: provider subject id, then registered email (links the provider to an
 * existing code-based account), then a fresh account with an unusable random
 * code_hmac (the user can set a real code later from their profile).
 */
/**
 * Signing in and signing up are the same click here, so the caller cannot
 * tell them apart on its own — and it has to, because only one of the two is
 * a registration worth counting.
 */
export async function findOrCreateOAuthUser(
  provider: "google" | "apple",
  subject: string,
  email: string | null,
  name: string | null,
  client: Client = db()
): Promise<{ userId: string; created: boolean }> {
  const column = provider === "google" ? "google_sub" : "apple_sub";

  const bySub = await client.execute({ sql: `SELECT id FROM auth_users WHERE ${column} = ? LIMIT 1`, args: [subject] });
  if (bySub.rows.length) return { userId: String(bySub.rows[0].id), created: false };

  if (email) {
    const byEmail = await client.execute({ sql: "SELECT id FROM auth_users WHERE email = ? LIMIT 1", args: [email] });
    if (byEmail.rows.length) {
      const id = String(byEmail.rows[0].id);
      await client.execute({ sql: `UPDATE auth_users SET ${column} = ? WHERE id = ?`, args: [subject, id] });
      // An existing account gaining a second way in, not a new customer.
      return { userId: id, created: false };
    }
  }

  const id = randomUUID();
  const displayName = name || (email ? email.split("@")[0] : "Friend");
  await client.execute({
    sql: `INSERT INTO auth_users (id, display_name, code_hmac, email, ${column}) VALUES (?, ?, ?, ?, ?)`,
    args: [id, displayName, `oauth:${randomBytes(32).toString("hex")}`, email, subject],
  });
  return { userId: id, created: true };
}

/* ---- Provider specifics ---- */

export function googleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: `${baseUrl()}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state: createOauthState(),
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function appleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.APPLE_CLIENT_ID ?? "",
    redirect_uri: `${baseUrl()}/api/auth/apple/callback`,
    response_type: "code",
    scope: "name email",
    response_mode: "form_post",
    state: createOauthState(),
  });
  return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
}

type IdTokenClaims = { sub?: string; email?: string; name?: string; aud?: string; iss?: string; exp?: number };

export function decodeIdToken(idToken: string): IdTokenClaims | null {
  try {
    const payload = idToken.split(".")[1];
    return JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as IdTokenClaims;
  } catch {
    return null;
  }
}

/** Validates claims of an id_token received directly from the provider's token endpoint over TLS. */
export function validClaims(claims: IdTokenClaims | null, audience: string, issuers: string[]): claims is IdTokenClaims & { sub: string } {
  return Boolean(
    claims &&
      claims.sub &&
      claims.aud === audience &&
      claims.iss &&
      issuers.includes(claims.iss) &&
      (claims.exp ?? 0) * 1000 > Date.now()
  );
}

/**
 * Normalizes APPLE_PRIVATE_KEY into valid PEM: accepts the full .p8 content,
 * a value with literal \n, or just the base64 body without BEGIN/END armor.
 */
export function applePrivateKeyPem(): string {
  const raw = (process.env.APPLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();
  if (raw.includes("BEGIN")) return raw;
  const body = raw.replace(/\s+/g, "");
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
}

/** Sign in with Apple requires a client secret that is itself an ES256 JWT. */
export function appleClientSecret(now = Date.now()): string {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: process.env.APPLE_KEY_ID })).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      iss: process.env.APPLE_TEAM_ID,
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + 15 * 60,
      aud: "https://appleid.apple.com",
      sub: process.env.APPLE_CLIENT_ID,
    })
  ).toString("base64url");
  const signingInput = `${header}.${claims}`;
  const key = createPrivateKey(applePrivateKeyPem());
  const signature = cryptoSign("sha256", Buffer.from(signingInput), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${signingInput}.${signature}`;
}

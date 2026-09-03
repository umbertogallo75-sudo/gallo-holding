import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Multi-user auth for a private, invite-only group.
 * Each user logs in with a personal access code; the session cookie carries a
 * signed token embedding the user id and its expiry. The original owner keeps
 * logging in via the APP_ACCESS_CODE env var and stays mapped to user "owner",
 * so pre-existing learning data remains attached.
 */

export const OWNER_ID = "owner";
export const SESSION_COOKIE = "english_buddy_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export type AuthMethod = "legacy" | "password" | "google" | "apple";
export type AuthSession = { userId: string; method: AuthMethod };

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

/**
 * Deterministic keyed hash of an access code, used for storage and lookup.
 * Codes are never stored in plaintext; HMAC with the server secret allows an
 * indexed equality lookup without a plaintext column.
 */
export function accessCodeHash(code: string) {
  return createHmac("sha256", secret()).update(`access-code:${code}`).digest("hex");
}

/** Keyed hash for one-time reset tokens (separate domain from access codes). */
export function resetTokenHash(token: string) {
  return createHmac("sha256", secret()).update(`reset-token:${token}`).digest("hex");
}

/** Creates a signed session token embedding user id, authentication method and expiry. */
export function createSessionToken(
  userId: string,
  now = Date.now(),
  method: Exclude<AuthMethod, "legacy"> = "password"
) {
  const encodedUserId = Buffer.from(userId, "utf8").toString("base64url");
  const payload = `v2.${encodedUserId}.${method}.${now + SESSION_MAX_AGE_SECONDS * 1000}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the authenticated session for current and pre-v2 signed tokens. */
export function parseAuthSession(token?: string | null, now = Date.now()): AuthSession | null {
  if (!token) return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  if (!safeEqual(signature, sign(payload))) return null;
  if (payload.startsWith("v2.")) {
    const parts = payload.split(".");
    if (parts.length !== 4) return null;
    const method = parts[2] as AuthMethod;
    if (!(["password", "google", "apple"] as AuthMethod[]).includes(method)) return null;
    const expiresAt = Number(parts[3]);
    let userId = "";
    try {
      userId = Buffer.from(parts[1], "base64url").toString("utf8");
    } catch {
      return null;
    }
    return userId && expiresAt > now ? { userId, method } : null;
  }

  // Sessions issued before authentication provenance was added remain valid.
  // Admin access treats these separately and only accepts provider-created
  // records; ordinary password sessions never gain privileges by email alone.
  const expiryDot = payload.lastIndexOf(".");
  if (expiryDot <= 0) return null;
  const userId = payload.slice(0, expiryDot);
  const expiresAt = Number(payload.slice(expiryDot + 1));
  return userId && expiresAt > now ? { userId, method: "legacy" } : null;
}

/** Returns the user id for a valid, unexpired token; null otherwise. */
export function parseSessionToken(token?: string | null, now = Date.now()): string | null {
  return parseAuthSession(token, now)?.userId ?? null;
}

export function isValidSessionToken(token?: string | null, now = Date.now()) {
  return parseSessionToken(token, now) !== null;
}

export async function getUserId() {
  return (await getAuthSession())?.userId ?? null;
}

export async function getAuthSession(): Promise<AuthSession | null> {
  const store = await cookies();
  return parseAuthSession(store.get(SESSION_COOKIE)?.value);
}

export async function requireUserId() {
  const id = await getUserId();
  if (!id) redirect("/login");
  return id;
}

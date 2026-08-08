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

/** Creates a signed session token embedding the user id and its expiry. */
export function createSessionToken(userId: string, now = Date.now()) {
  const payload = `${userId}.${now + SESSION_MAX_AGE_SECONDS * 1000}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the user id for a valid, unexpired token; null otherwise. */
export function parseSessionToken(token?: string | null, now = Date.now()): string | null {
  if (!token) return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  if (!safeEqual(signature, sign(payload))) return null;
  const expiryDot = payload.lastIndexOf(".");
  if (expiryDot <= 0) return null;
  const userId = payload.slice(0, expiryDot);
  const expiresAt = Number(payload.slice(expiryDot + 1));
  return userId && expiresAt > now ? userId : null;
}

export function isValidSessionToken(token?: string | null, now = Date.now()) {
  return parseSessionToken(token, now) !== null;
}

export async function getUserId() {
  const store = await cookies();
  return parseSessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function requireUserId() {
  const id = await getUserId();
  if (!id) redirect("/login");
  return id;
}

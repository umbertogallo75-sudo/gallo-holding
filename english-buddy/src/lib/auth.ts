import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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

/** Creates a signed session token that embeds its own expiry timestamp. */
export function createSessionToken(now = Date.now()) {
  const payload = `${OWNER_ID}.${now + SESSION_MAX_AGE_SECONDS * 1000}`;
  return `${payload}.${sign(payload)}`;
}

export function isValidSessionToken(token?: string | null, now = Date.now()) {
  if (!token) return false;
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return false;
  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  if (!safeEqual(signature, sign(payload))) return false;
  const [ownerId, expiresAt] = payload.split(".");
  return ownerId === OWNER_ID && Number(expiresAt) > now;
}

export async function getUserId() {
  const store = await cookies();
  return isValidSessionToken(store.get(SESSION_COOKIE)?.value) ? OWNER_ID : null;
}

export async function requireUserId() {
  const id = await getUserId();
  if (!id) redirect("/login");
  return id;
}

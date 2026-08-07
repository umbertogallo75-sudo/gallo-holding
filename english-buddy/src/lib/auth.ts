import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const OWNER_ID = "owner";
export const SESSION_COOKIE = "english_buddy_session";

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return value;
}

export function expectedSessionToken() {
  return createHmac("sha256", secret()).update(`english-buddy:${OWNER_ID}`).digest("hex");
}

export function isValidSessionToken(token?: string | null) {
  if (!token) return false;
  const expected = expectedSessionToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
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

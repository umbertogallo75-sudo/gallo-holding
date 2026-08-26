import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Links inside an email have to work for someone who is not signed in — the
 * unsubscribe link most of all, because a person who wants out must never be
 * asked to log in first in order to be left alone.
 *
 * So the identity travels in the URL, signed. Nothing is stored: the token is
 * the user id plus an HMAC of it, scoped by purpose so that a link handed to
 * a mail client for one-click unsubscribe can never be replayed to hand out a
 * free trial.
 */
export type TokenPurpose = "unsub" | "trial";

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is missing");
  return value;
}

function sign(userId: string, purpose: TokenPurpose): string {
  return createHmac("sha256", secret()).update(`email:${purpose}:${userId}`).digest("hex").slice(0, 32);
}

export function emailToken(userId: string, purpose: TokenPurpose): string {
  return `${Buffer.from(userId, "utf8").toString("base64url")}.${sign(userId, purpose)}`;
}

/** The user id a token stands for, or null if it does not verify. */
export function readEmailToken(token: string | undefined | null, purpose: TokenPurpose): string | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  let userId: string;
  try {
    userId = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!userId) return null;
  const expected = Buffer.from(sign(userId, purpose), "utf8");
  const given = Buffer.from(signature, "utf8");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return userId;
}

export function appBase(): string {
  return (process.env.APP_BASE_URL || "https://www.execlingo.it").replace(/\/$/, "");
}

export function unsubscribeUrl(userId: string): string {
  return `${appBase()}/disiscriviti/${emailToken(userId, "unsub")}`;
}

export function trialUrl(userId: string): string {
  return `${appBase()}/prova/${emailToken(userId, "trial")}`;
}

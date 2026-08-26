import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { isUnsubscribed } from "./prefs";
import { isSuppressed } from "./suppression";
import { unsubscribeUrl } from "./tokens";

/**
 * The one door every lifecycle and marketing email goes through.
 *
 * Nothing calls sendEmail directly for this kind of message, because four
 * things have to be true every single time and remembering them at each call
 * site is how one of them eventually gets forgotten: the person has not asked
 * to be left alone, the same email is not sent twice, the mail carries a way
 * out, and a failure does not silently burn the only attempt.
 */
const SCHEMA = `CREATE TABLE IF NOT EXISTS email_sends (
  claim_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_email_sends_user ON email_sends(user_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_email_sends_kind ON email_sends(kind, sent_at);`;

export type Sender = (
  to: string,
  subject: string,
  html: string,
  text?: string,
  headers?: Record<string, string>
) => Promise<boolean>;

export type Message = { subject: string; html: string; text: string };

export type SendResult = "sent" | "unsubscribed" | "already" | "throttled" | "failed" | "invalid";

/**
 * A claim key that repeats is a second email. `once` for the emails a person
 * may only ever get one of, a dated key for the ones that may come back.
 */
export function onceKey(userId: string, kind: string): string {
  return `${userId}:${kind}`;
}
export function dailyKey(userId: string, kind: string, day: string): string {
  return `${userId}:${kind}:${day}`;
}

/** A throwaway address from a test fixture is not a person to write to. */
export function isRealAddress(email: string | null | undefined): email is string {
  return Boolean(email) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email as string) && !/@example\./i.test(email as string);
}

export async function sendMarketing(
  opts: {
    userId: string;
    email: string | null;
    kind: string;
    claimKey: string;
    message: Message;
    /**
     * Refuse if anything has already been sent to this person inside this
     * many hours. The automatic passes set it; a reward the person just
     * earned, and a campaign the owner deliberately wrote, do not.
     */
    throttleHours?: number;
    /**
     * The clock. Threaded through rather than read from the system, the same
     * way the rest of the scheduling is: a pass that consults `Date.now()`
     * halfway cannot be replayed, and cannot be tested across days at all.
     */
    now?: Date;
  },
  client: Client = db(),
  send: Sender = sendEmail
): Promise<SendResult> {
  const { userId, email, kind, claimKey, message, throttleHours, now = new Date() } = opts;
  if (!isRealAddress(email)) return "invalid";
  // Two lists, and both are checked: the account preference, and the address
  // itself. The second is what still holds when the account that expressed
  // the objection no longer exists.
  if (await isUnsubscribed(userId, client)) return "unsubscribed";
  if (await isSuppressed(email, client)) return "unsubscribed";
  if (throttleHours && (await sentWithin(userId, throttleHours, client, now))) return "throttled";

  const claim = async () =>
    client.execute({
      // sent_at written from the caller's clock, not SQLite's, so the
      // throttle above measures against the same time the pass is using.
      sql: "INSERT OR IGNORE INTO email_sends (claim_key, user_id, kind, sent_at) VALUES (?, ?, ?, ?)",
      args: [claimKey, userId, kind, now.toISOString().slice(0, 19).replace("T", " ")],
    });
  let claimed;
  try {
    claimed = await claim();
  } catch {
    try {
      await client.executeMultiple(SCHEMA);
      claimed = await claim();
    } catch {
      return "failed";
    }
  }
  if (claimed.rowsAffected === 0) return "already";

  const out = unsubscribeUrl(userId);
  const ok = await send(email, message.subject, message.html, message.text, {
    "List-Unsubscribe": `<${out}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });

  if (!ok) {
    // The claim is taken before the send so two cron runs cannot both write to
    // the same person. That makes releasing it on failure the other half of
    // the bargain: without this, one bad minute at the provider would cost
    // somebody their welcome email permanently, and nothing would say so.
    await client
      .execute({ sql: "DELETE FROM email_sends WHERE claim_key = ?", args: [claimKey] })
      .catch(() => null);
    return "failed";
  }
  return "sent";
}

/**
 * Anything at all sent to this person recently.
 *
 * Several passes run in the same hour and each has a good reason to write.
 * Together they would arrive as a pile, which reads as a mailing list that
 * has lost control of itself — and that is the moment people unsubscribe,
 * whatever any individual email said.
 */
export async function sentWithin(
  userId: string,
  hours: number,
  client: Client = db(),
  now: Date = new Date()
): Promise<boolean> {
  const since = new Date(now.getTime() - hours * 3_600_000).toISOString().slice(0, 19).replace("T", " ");
  try {
    const result = await client.execute({
      sql: "SELECT 1 FROM email_sends WHERE user_id = ? AND sent_at >= ? LIMIT 1",
      args: [userId, since],
    });
    return result.rows.length > 0;
  } catch {
    // Unreadable history is not permission to pile on.
    return true;
  }
}

/** Whether this person has already been sent this kind of email, ever. */
export async function alreadySent(userId: string, kind: string, client: Client = db()): Promise<boolean> {
  try {
    const result = await client.execute({
      sql: "SELECT 1 FROM email_sends WHERE user_id = ? AND kind = ? LIMIT 1",
      args: [userId, kind],
    });
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

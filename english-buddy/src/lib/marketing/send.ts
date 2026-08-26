import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { isUnsubscribed } from "./prefs";
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

export type SendResult = "sent" | "unsubscribed" | "already" | "failed" | "invalid";

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
  opts: { userId: string; email: string | null; kind: string; claimKey: string; message: Message },
  client: Client = db(),
  send: Sender = sendEmail
): Promise<SendResult> {
  const { userId, email, kind, claimKey, message } = opts;
  if (!isRealAddress(email)) return "invalid";
  if (await isUnsubscribed(userId, client)) return "unsubscribed";

  const claim = async () =>
    client.execute({
      sql: "INSERT OR IGNORE INTO email_sends (claim_key, user_id, kind) VALUES (?, ?, ?)",
      args: [claimKey, userId, kind],
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

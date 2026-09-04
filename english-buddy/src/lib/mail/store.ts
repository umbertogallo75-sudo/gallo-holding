import { randomUUID, randomBytes } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";

/**
 * Forwarded email, and how it finds its way to the right account.
 *
 * The obvious idea — look at who sent it — does not work twice over: people
 * forward from the address they happen to be reading in, which is rarely the
 * one they registered with, and a From line is trivial to forge. So the
 * question is turned around. It does not matter where the message came from;
 * it matters where it arrived. Every account gets its own unguessable address
 * on a subdomain of its own, and that address is the key.
 *
 * The subdomain matters on its own: it means the MX records of execlingo.it
 * are never touched, so nothing done here can break the mail the company
 * already receives.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS mail_aliases (
  alias TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mail_aliases_user ON mail_aliases(user_id);
CREATE TABLE IF NOT EXISTS mail_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_id TEXT,
  from_address TEXT,
  from_name TEXT,
  subject TEXT,
  body_text TEXT,
  received_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sender_known INTEGER NOT NULL DEFAULT 0,
  summary_it TEXT,
  asks_json TEXT,
  reply_en TEXT,
  counterpart TEXT,
  expressions_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_mail_items_user ON mail_items(user_id, received_at DESC);
CREATE TABLE IF NOT EXISTS mail_senders (
  user_id TEXT NOT NULL,
  address TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (user_id, address)
);`;

let ensured = false;

/**
 * Creates the tables on first use, and gets out of the way after that.
 *
 * The flag only lives as long as one server process, so on a cold start this
 * used to run eight statements against a database on the other side of the
 * network before the page could say anything — which is felt as the app being
 * slow to open. One cheap read answers the only question that matters: if the
 * newest column is already there, everything before it is too.
 */
export async function ensureMailSchema(client: Client = db()): Promise<void> {
  if (ensured) return;
  try {
    await client.execute("SELECT source_id FROM mail_items LIMIT 0");
    ensured = true;
    return;
  } catch {
    // Either the table is missing or it predates that column. Both are fixed
    // below, and both happen approximately once.
  }
  for (const statement of SCHEMA.split(";")) {
    const sql = statement.trim();
    if (sql) await client.execute(sql);
  }
  // Tables created before delivery ids were recorded: add the column, then the
  // index that makes a redelivery collide instead of duplicating.
  await client.execute("ALTER TABLE mail_items ADD COLUMN source_id TEXT").catch(() => {});
  await client
    .execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_items_source ON mail_items(source_id)")
    .catch(() => {});
  ensured = true;
}

/** Only for tests, which rebuild the database between cases. */
export function resetMailSchemaCache(): void {
  ensured = false;
}

export function inboundDomain(): string {
  return process.env.MAIL_INBOUND_DOMAIN?.trim() || "in.execlingo.it";
}

/**
 * The local part of a personal address.
 *
 * Twelve characters from a 32-letter alphabet is sixty bits: not guessable by
 * anyone throwing addresses at the server, which matters because possession
 * of this string is what proves whose account a message belongs to. The
 * alphabet drops the letters that are misread when somebody types it off a
 * screen — no 0/O, no 1/l/I.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function newAliasLocalPart(): string {
  const bytes = randomBytes(12);
  let out = "m-";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

export function aliasAddress(alias: string): string {
  return `${alias}@${inboundDomain()}`;
}

/** The address for this account, made on first sight and kept after that. */
export async function aliasFor(userId: string, client: Client = db()): Promise<string> {
  await ensureMailSchema(client);
  const existing = await client.execute({
    sql: "SELECT alias FROM mail_aliases WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
    args: [userId],
  });
  if (existing.rows.length) return String(existing.rows[0].alias);
  const alias = newAliasLocalPart();
  await client.execute({
    sql: "INSERT INTO mail_aliases (alias, user_id, created_at) VALUES (?, ?, ?)",
    args: [alias, userId, new Date().toISOString()],
  });
  return alias;
}

/**
 * Replaces the address, and retires every older one for this account.
 *
 * An address that has leaked cannot be un-leaked, so regenerating has to
 * actually close the old door rather than open a second one beside it.
 */
export async function regenerateAlias(userId: string, client: Client = db()): Promise<string> {
  await ensureMailSchema(client);
  await client.execute({ sql: "DELETE FROM mail_aliases WHERE user_id = ?", args: [userId] });
  return aliasFor(userId, client);
}

export async function userForAlias(alias: string, client: Client = db()): Promise<string | null> {
  await ensureMailSchema(client);
  const result = await client.execute({
    sql: "SELECT user_id FROM mail_aliases WHERE alias = ? LIMIT 1",
    args: [alias.toLowerCase()],
  });
  return result.rows.length ? String(result.rows[0].user_id) : null;
}

export type MailItem = {
  id: string;
  userId: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  bodyText: string;
  receivedAt: string;
  status: "pending" | "ready" | "failed";
  senderKnown: boolean;
  summaryIt: string;
  asks: string[];
  replyEn: string;
  counterpart: string;
  expressions: { expression: string; meaning: string }[];
};

function toItem(row: Record<string, unknown>): MailItem {
  const parse = <T,>(raw: unknown, fallback: T): T => {
    try { return raw ? (JSON.parse(String(raw)) as T) : fallback; } catch { return fallback; }
  };
  return {
    id: String(row.id),
    userId: String(row.user_id),
    fromAddress: String(row.from_address ?? ""),
    fromName: String(row.from_name ?? ""),
    subject: String(row.subject ?? ""),
    bodyText: String(row.body_text ?? ""),
    receivedAt: String(row.received_at ?? ""),
    status: (String(row.status ?? "pending") as MailItem["status"]),
    senderKnown: Number(row.sender_known ?? 0) === 1,
    summaryIt: String(row.summary_it ?? ""),
    asks: parse<string[]>(row.asks_json, []),
    replyEn: String(row.reply_en ?? ""),
    counterpart: String(row.counterpart ?? ""),
    expressions: parse<MailItem["expressions"]>(row.expressions_json, []),
  };
}

/**
 * Stores an arriving message, once.
 *
 * The mail service redelivers anything it did not get a clean answer to, and
 * offers a Replay button besides — so the same email can arrive two or three
 * times, and each arrival would otherwise become another copy in somebody's
 * list, each costing a call to the model. The provider's own id for the
 * delivery is kept and made unique: a repeat collides with the row already
 * there, and the existing one is returned as if it had just been made.
 */
export async function saveIncoming(
  input: {
    userId: string;
    fromAddress: string;
    fromName: string;
    subject: string;
    bodyText: string;
    senderKnown: boolean;
    sourceId?: string;
  },
  client: Client = db()
): Promise<{ id: string; alreadySeen: boolean }> {
  await ensureMailSchema(client);
  if (input.sourceId) {
    const seen = await client.execute({
      sql: "SELECT id FROM mail_items WHERE source_id = ? LIMIT 1",
      args: [input.sourceId],
    });
    if (seen.rows.length) return { id: String(seen.rows[0].id), alreadySeen: true };
  }
  const id = randomUUID();
  await client.execute({
    sql: `INSERT INTO mail_items (id, user_id, source_id, from_address, from_name, subject, body_text, received_at, status, sender_known)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    args: [
      id,
      input.userId,
      input.sourceId ?? null,
      input.fromAddress,
      input.fromName,
      input.subject,
      input.bodyText,
      new Date().toISOString(),
      input.senderKnown ? 1 : 0,
    ],
  });
  return { id, alreadySeen: false };
}

export async function attachAnswer(
  id: string,
  answer: { summaryIt: string; asks: string[]; replyEn: string; counterpart: string; expressions: MailItem["expressions"] },
  client: Client = db()
): Promise<void> {
  await client.execute({
    sql: `UPDATE mail_items SET status = 'ready', summary_it = ?, asks_json = ?, reply_en = ?, counterpart = ?, expressions_json = ?
          WHERE id = ?`,
    args: [
      answer.summaryIt,
      JSON.stringify(answer.asks),
      answer.replyEn,
      answer.counterpart,
      JSON.stringify(answer.expressions),
      id,
    ],
  });
}

export async function markFailed(id: string, client: Client = db()): Promise<void> {
  await client.execute({ sql: "UPDATE mail_items SET status = 'failed' WHERE id = ?", args: [id] });
}

export async function replaceReply(id: string, userId: string, reply: string, client: Client = db()): Promise<void> {
  await client.execute({
    sql: "UPDATE mail_items SET reply_en = ? WHERE id = ? AND user_id = ?",
    args: [reply, id, userId],
  });
}

export async function listMail(userId: string, client: Client = db()): Promise<MailItem[]> {
  await ensureMailSchema(client);
  const result = await client.execute({
    sql: "SELECT * FROM mail_items WHERE user_id = ? ORDER BY received_at DESC LIMIT 100",
    args: [userId],
  });
  return result.rows.map((row) => toItem(row as unknown as Record<string, unknown>));
}

export async function readMail(id: string, userId: string, client: Client = db()): Promise<MailItem | null> {
  await ensureMailSchema(client);
  const result = await client.execute({
    sql: "SELECT * FROM mail_items WHERE id = ? AND user_id = ? LIMIT 1",
    args: [id, userId],
  });
  return result.rows.length ? toItem(result.rows[0] as unknown as Record<string, unknown>) : null;
}

export async function deleteMail(id: string, userId: string, client: Client = db()): Promise<void> {
  await client.execute({ sql: "DELETE FROM mail_items WHERE id = ? AND user_id = ?", args: [id, userId] });
}

/** How long the original message is kept before only the answer remains. */
export const BODY_RETENTION_DAYS = 30;

/**
 * Drops the original text of old messages, keeping what was made from it.
 *
 * A forwarded email is somebody else's correspondence as much as the user's,
 * and there is no reason to hold it once the answer exists. The summary and
 * the suggested reply stay, so the history is still worth having.
 */
export async function forgetOldBodies(userId: string, now = new Date(), client: Client = db()): Promise<number> {
  const cutoff = new Date(now.getTime() - BODY_RETENTION_DAYS * 86_400_000).toISOString();
  const result = await client.execute({
    sql: "UPDATE mail_items SET body_text = '' WHERE user_id = ? AND received_at < ? AND body_text != ''",
    args: [userId, cutoff],
  });
  return result.rowsAffected ?? 0;
}

export async function senderIsKnown(userId: string, address: string, accountEmail: string | null, client: Client = db()): Promise<boolean> {
  const normalised = address.trim().toLowerCase();
  if (!normalised) return false;
  if (accountEmail && accountEmail.trim().toLowerCase() === normalised) return true;
  const result = await client.execute({
    sql: "SELECT 1 FROM mail_senders WHERE user_id = ? AND address = ? LIMIT 1",
    args: [userId, normalised],
  });
  return result.rows.length > 0;
}

export async function rememberSender(userId: string, address: string, client: Client = db()): Promise<void> {
  await ensureMailSchema(client);
  const normalised = address.trim().toLowerCase();
  if (!normalised) return;
  await client.execute({
    sql: "INSERT OR IGNORE INTO mail_senders (user_id, address, added_at) VALUES (?, ?, ?)",
    args: [userId, normalised, new Date().toISOString()],
  });
  await client.execute({
    sql: "UPDATE mail_items SET sender_known = 1 WHERE user_id = ? AND from_address = ?",
    args: [userId, normalised],
  });
}

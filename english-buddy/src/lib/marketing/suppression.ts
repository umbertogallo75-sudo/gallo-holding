import { createHash } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";

/**
 * The list of addresses that must never be written to again, kept as hashes
 * so that it survives the deletion of the account it came from.
 *
 * The account-level preference in `email_prefs` is the everyday one and is
 * deleted with the account, as it must be. This is the part that has to
 * outlive it: an objection that disappears when the account does is not an
 * objection, and the same address arriving a second time would be treated as
 * if nothing had ever been said.
 *
 * A hash is the whole point. It recognises an address without storing it, so
 * somebody who asked to be forgotten is not kept on a list in readable form.
 */
const SCHEMA = `CREATE TABLE IF NOT EXISTS email_suppression (
  email_hash TEXT PRIMARY KEY,
  added_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  reason TEXT
);`;

export function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

async function heal(client: Client) {
  try {
    await client.executeMultiple(SCHEMA);
  } catch { /* concurrent create */ }
}

export async function suppress(email: string, reason: string, client: Client = db()): Promise<void> {
  const write = () =>
    client.execute({
      sql: "INSERT OR IGNORE INTO email_suppression (email_hash, reason) VALUES (?, ?)",
      args: [emailHash(email), reason],
    });
  try {
    await write();
  } catch {
    await heal(client);
    await write().catch(() => null);
  }
}

/** Undo, for somebody who unsubscribed by mistake and says so. */
export async function unsuppress(email: string, client: Client = db()): Promise<void> {
  await client
    .execute({ sql: "DELETE FROM email_suppression WHERE email_hash = ?", args: [emailHash(email)] })
    .catch(() => null);
}

export async function isSuppressed(email: string, client: Client = db()): Promise<boolean> {
  try {
    const result = await client.execute({
      sql: "SELECT 1 FROM email_suppression WHERE email_hash = ? LIMIT 1",
      args: [emailHash(email)],
    });
    return result.rows.length > 0;
  } catch {
    // No table means nothing has ever been suppressed. Refusing to send in
    // that case would silence the whole system on a first run.
    await heal(client);
    return false;
  }
}

import type { Client } from "@libsql/client";
import { db } from "@/lib/db";

/**
 * Who has asked not to receive marketing.
 *
 * Absence of a row means subscribed: people who registered before this
 * existed never made a choice, and treating silence as a refusal would mean
 * never writing to anyone.
 */
const SCHEMA = `CREATE TABLE IF NOT EXISTS email_prefs (
  user_id TEXT PRIMARY KEY,
  unsubscribed_at TEXT,
  source TEXT,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);`;

async function heal(client: Client) {
  try {
    await client.executeMultiple(SCHEMA);
  } catch { /* concurrent create */ }
}

export async function isUnsubscribed(userId: string, client: Client = db()): Promise<boolean> {
  const read = () =>
    client.execute({ sql: "SELECT unsubscribed_at FROM email_prefs WHERE user_id = ? LIMIT 1", args: [userId] });
  let result;
  try {
    result = await read();
  } catch {
    await heal(client);
    try {
      result = await read();
    } catch {
      // Unreadable preferences must not become permission to write to people.
      return true;
    }
  }
  return Boolean(result.rows[0]?.unsubscribed_at);
}

/** The set of ids to skip, for a pass that is about to consider many users. */
export async function unsubscribedIds(client: Client = db()): Promise<Set<string>> {
  const read = () => client.execute("SELECT user_id FROM email_prefs WHERE unsubscribed_at IS NOT NULL");
  let result;
  try {
    result = await read();
  } catch {
    await heal(client);
    try {
      result = await read();
    } catch {
      return new Set();
    }
  }
  return new Set(result.rows.map((row) => String(row.user_id)));
}

export async function setSubscription(
  userId: string,
  subscribed: boolean,
  source: string,
  client: Client = db()
): Promise<void> {
  const write = () =>
    client.execute({
      sql: `INSERT INTO email_prefs (user_id, unsubscribed_at, source, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
              unsubscribed_at = excluded.unsubscribed_at,
              source = excluded.source,
              updated_at = CURRENT_TIMESTAMP`,
      args: [userId, subscribed ? null : new Date().toISOString(), source],
    });
  try {
    await write();
  } catch {
    await heal(client);
    await write();
  }
}

import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { scoreSession, type SessionFacts, type SessionScore } from "./session-score";

/**
 * Sessions you can come back to.
 *
 * Everything a conversation produces was already stored — messages,
 * corrections, expressions. What was not stored was anywhere to put the fact
 * that you were in the middle of one: the session id lived in a React state
 * and died with the tab. So a tester who took a phone call came back to a
 * blank screen and started again, having lost the thread they were halfway
 * through. All that was missing was the pointer.
 */

/** After this long, picking up where you left off is stranger than starting. */
export const RESUMABLE_HOURS = 36;
/** Below this it was a false start, not something worth offering back. */
const MIN_MESSAGES = 2;

export type SessionSummary = {
  id: string;
  mode: string;
  startedAt: string;
  lastAt: string;
  exchanges: number;
  closed: boolean;
};

export type Transcript = { role: string; content: string; correction: string | null; at: string }[];

/**
 * closed_at arrives with migration 0028, and nothing here may wait for it.
 *
 * The deploy lands before anybody applies the migration, and the migration
 * endpoint needs a secret that only the owner holds — so "it works after
 * somebody remembers" is not a plan. Mirrors 0028 the way the other tables
 * mirror theirs: the first query that misses the column adds it and retries,
 * and if even that is refused the read degrades to "nothing was ever closed",
 * which on a database without the column is exactly true.
 */
const ADD_COLUMN = "ALTER TABLE sessions ADD COLUMN closed_at TEXT";
let healed = false;

async function heal(client: Client): Promise<boolean> {
  if (healed) return true;
  try {
    await client.execute(ADD_COLUMN);
    healed = true;
  } catch {
    // Already there (added by the migration or by a parallel request), or the
    // table is not ours to alter. The retry tells the two apart.
    healed = false;
  }
  return healed;
}

async function withClosedAt<T>(client: Client, run: (hasColumn: boolean) => Promise<T>): Promise<T> {
  try {
    return await run(true);
  } catch {
    if (await heal(client)) {
      try {
        return await run(true);
      } catch {
        /* fall through to the column-less read */
      }
    }
    return run(false);
  }
}

/** The one to offer back, if there is one. */
export async function resumableSession(userId: string, client: Client = db()): Promise<SessionSummary | null> {
  const since = new Date(Date.now() - RESUMABLE_HOURS * 3_600_000).toISOString();
  return withClosedAt(client, async (hasColumn) => {
    const result = await client.execute({
      sql: `SELECT s.id, s.mode, s.started_at, ${hasColumn ? "s.closed_at" : "NULL AS closed_at"},
                   MAX(m.created_at) AS last_at, COUNT(m.id) AS n
            FROM sessions s JOIN messages m ON m.session_id = s.id
            WHERE s.user_id = ? AND s.started_at >= ? ${hasColumn ? "AND s.closed_at IS NULL" : ""}
            GROUP BY s.id
            HAVING n >= ?
            ORDER BY last_at DESC
            LIMIT 1`,
      args: [userId, since, MIN_MESSAGES],
    });
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      mode: String(row.mode),
      startedAt: String(row.started_at),
      lastAt: String(row.last_at),
      exchanges: Number(row.n ?? 0),
      closed: false,
    };
  });
}

/** The ones to look back at. */
export async function recentSessions(userId: string, limit = 25, client: Client = db()): Promise<SessionSummary[]> {
  return withClosedAt(client, async (hasColumn) => {
    const result = await client.execute({
      sql: `SELECT s.id, s.mode, s.started_at, ${hasColumn ? "s.closed_at" : "NULL AS closed_at"},
                   MAX(m.created_at) AS last_at, COUNT(m.id) AS n
            FROM sessions s JOIN messages m ON m.session_id = s.id
            WHERE s.user_id = ?
            GROUP BY s.id
            HAVING n >= ?
            ORDER BY last_at DESC
            LIMIT ?`,
      args: [userId, MIN_MESSAGES, limit],
    });
    return result.rows.map((row) => ({
      id: String(row.id),
      mode: String(row.mode),
      startedAt: String(row.started_at),
      lastAt: String(row.last_at),
      exchanges: Number(row.n ?? 0),
      closed: Boolean(row.closed_at),
    }));
  });
}

/** Everything that was said, oldest first — the order it is read in. */
export async function sessionTranscript(userId: string, sessionId: string, client: Client = db()): Promise<Transcript> {
  const result = await client.execute({
    sql: `SELECT role, content, correction, created_at FROM messages
          WHERE user_id = ? AND session_id = ? ORDER BY created_at ASC, rowid ASC LIMIT 200`,
    args: [userId, sessionId],
  });
  return result.rows.map((row) => ({
    role: String(row.role),
    content: String(row.content),
    correction: row.correction ? String(row.correction) : null,
    at: String(row.created_at),
  }));
}

/** Finished on purpose. Idempotent: closing twice keeps the first time. */
export async function closeSession(userId: string, sessionId: string, client: Client = db()): Promise<void> {
  try {
    await client.execute({
      sql: "UPDATE sessions SET closed_at = COALESCE(closed_at, ?) WHERE id = ? AND user_id = ?",
      args: [new Date().toISOString(), sessionId, userId],
    });
  } catch {
    // The column is not there yet: add it and write the close properly. If
    // that fails too the session simply stays resumable, which is a smaller
    // problem than failing the request that ends it.
    try {
      await client.execute(ADD_COLUMN);
      await client.execute({
        sql: "UPDATE sessions SET closed_at = COALESCE(closed_at, ?) WHERE id = ? AND user_id = ?",
        args: [new Date().toISOString(), sessionId, userId],
      });
    } catch { /* stays resumable */ }
  }
}

/** What to show when a session ends: the numbers, and what they add up to. */
export async function sessionReport(
  userId: string,
  sessionId: string,
  client: Client = db()
): Promise<{ facts: SessionFacts; score: SessionScore }> {
  const [messages, expressions] = await Promise.all([
    client.execute({
      sql: `SELECT role, correction, created_at FROM messages WHERE user_id = ? AND session_id = ?`,
      args: [userId, sessionId],
    }),
    client
      .execute({
        sql: `SELECT COUNT(*) AS n FROM expressions WHERE user_id = ?
              AND created_at >= (SELECT MIN(created_at) FROM messages WHERE session_id = ?)`,
        args: [userId, sessionId],
      })
      .catch(() => null),
  ]);

  const rows = messages.rows;
  const exchanges = rows.filter((row) => String(row.role) === "user").length;
  const corrected = rows.filter((row) => row.correction).length;
  const times = rows.map((row) => Date.parse(String(row.created_at))).filter((t) => !Number.isNaN(t));
  const minutes = times.length > 1 ? Math.max(0, Math.round((Math.max(...times) - Math.min(...times)) / 60_000)) : 0;
  const learned = Number(expressions?.rows[0]?.n ?? 0);

  const facts: SessionFacts = { exchanges, corrected, learned, minutes };
  return { facts, score: scoreSession(facts) };
}

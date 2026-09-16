import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { scoreSession, type SessionFacts, type SessionScore } from "./session-score";
import { isSyntheticOpener } from "./openers";

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
/**
 * Below this it was a false start, not something worth keeping.
 *
 * Counted in turns the learner actually took, not in messages. Counting
 * messages meant that opening the app and closing it again left a
 * "conversation" in the archive — Sam's greeting, plus the instruction that
 * produced it — so testers found a list full of sessions of a few seconds
 * they had never had. Two turns is the smallest thing that is honestly a
 * conversation.
 */
const MIN_TURNS = 2;

/**
 * Spoken or written, and the list that is both.
 *
 * Without this the chat would offer to resume a conversation that happened at
 * the microphone, and reopen it as text with Sam mid-sentence about something
 * the learner said out loud. Two media, one history: shown together, resumed
 * apart.
 */
export type SessionKind = "text" | "voice" | "all";
/** The modes that happened at the microphone. */
export const VOICE_MODES = ["voice", "diary"] as const;
const VOICE_LIST = VOICE_MODES.map((mode) => `'${mode}'`).join(", ");

function kindClause(kind: SessionKind): string {
  if (kind === "voice") return `AND s.mode IN (${VOICE_LIST})`;
  if (kind === "text") return `AND s.mode NOT IN (${VOICE_LIST})`;
  return "";
}

export function isVoiceMode(mode: string): boolean {
  return (VOICE_MODES as readonly string[]).includes(mode);
}

export type SessionSummary = {
  id: string;
  mode: string;
  startedAt: string;
  lastAt: string;
  /** Turns the learner took: what makes this a conversation rather than a tap. */
  exchanges: number;
  closed: boolean;
  voice: boolean;
  /** The first thing actually said, so a row can be recognised at a glance. */
  preview: string;
  /** Minutes from the first line to the last. */
  minutes: number;
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

function minutesBetween(from: string, to: string): number {
  const a = Date.parse(from.includes("T") ? from : from.replace(" ", "T") + "Z");
  const b = Date.parse(to.includes("T") ? to : to.replace(" ", "T") + "Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 60_000));
}

function summaryOf(row: Record<string, unknown>, closed: boolean): SessionSummary {
  const mode = String(row.mode);
  const firstUser = row.first_user ? String(row.first_user) : "";
  const firstCoach = row.first_coach ? String(row.first_coach) : "";
  // A conversation recorded before the instruction stopped being stored still
  // carries it as its first line; those are recognised by Sam's answer instead.
  const preview = (firstUser && !isSyntheticOpener(firstUser) ? firstUser : firstCoach).replace(/\s+/g, " ").trim();
  return {
    id: String(row.id),
    mode,
    startedAt: String(row.started_at),
    lastAt: String(row.last_at),
    exchanges: Number(row.turns ?? 0),
    closed,
    voice: isVoiceMode(mode),
    preview: preview.length > 120 ? `${preview.slice(0, 117)}\u2026` : preview,
    minutes: minutesBetween(String(row.started_at), String(row.last_at)),
  };
}

/**
 * What every listing needs: how many turns the learner actually took, and
 * enough of the conversation to recognise it by. A list of rows that all read
 * "Conversazione · 8 messaggi" is a list nobody can search with their eyes,
 * which is what the testers were describing.
 */
const SUMMARY_COLUMNS = `s.id, s.mode, s.started_at,
   MAX(m.created_at) AS last_at,
   COUNT(CASE WHEN m.role = 'user' THEN 1 END) AS turns,
   (SELECT content FROM messages WHERE session_id = s.id AND role = 'user' ORDER BY created_at ASC, rowid ASC LIMIT 1) AS first_user,
   (SELECT content FROM messages WHERE session_id = s.id AND role = 'assistant' ORDER BY created_at ASC, rowid ASC LIMIT 1) AS first_coach`;

/** The one to offer back, if there is one. */
export async function resumableSession(
  userId: string,
  opts: { kind?: SessionKind } = {},
  client: Client = db()
): Promise<SessionSummary | null> {
  const since = new Date(Date.now() - RESUMABLE_HOURS * 3_600_000).toISOString();
  const kind = kindClause(opts.kind ?? "all");
  return withClosedAt(client, async (hasColumn) => {
    const result = await client.execute({
      sql: `SELECT ${SUMMARY_COLUMNS}, ${hasColumn ? "s.closed_at" : "NULL AS closed_at"}
            FROM sessions s JOIN messages m ON m.session_id = s.id
            WHERE s.user_id = ? AND s.started_at >= ? ${kind} ${hasColumn ? "AND s.closed_at IS NULL" : ""}
            GROUP BY s.id
            HAVING turns >= ?
            ORDER BY last_at DESC
            LIMIT 1`,
      args: [userId, since, MIN_TURNS],
    });
    const row = result.rows[0];
    return row ? summaryOf(row as Record<string, unknown>, false) : null;
  });
}

/** The ones to look back at, optionally the ones with a word in them. */
export async function recentSessions(
  userId: string,
  opts: { limit?: number; kind?: SessionKind; search?: string } = {},
  client: Client = db()
): Promise<SessionSummary[]> {
  const limit = Math.min(Math.max(1, Math.round(opts.limit ?? 25)), 100);
  const kind = kindClause(opts.kind ?? "all");
  // Looking for one conversation among fifty: it is searched by what was said
  // in it, because what was said in it is the only thing anybody remembers.
  const term = (opts.search ?? "").trim().slice(0, 60);
  const search = term ? "AND EXISTS (SELECT 1 FROM messages mm WHERE mm.session_id = s.id AND mm.content LIKE ?)" : "";
  const args: (string | number)[] = [userId];
  if (term) args.push(`%${term.replace(/[%_]/g, " ")}%`);
  args.push(MIN_TURNS, limit);

  return withClosedAt(client, async (hasColumn) => {
    const result = await client.execute({
      sql: `SELECT ${SUMMARY_COLUMNS}, ${hasColumn ? "s.closed_at" : "NULL AS closed_at"}
            FROM sessions s JOIN messages m ON m.session_id = s.id
            WHERE s.user_id = ? ${kind} ${search}
            GROUP BY s.id
            HAVING turns >= ?
            ORDER BY last_at DESC
            LIMIT ?`,
      args,
    });
    return result.rows.map((row) => summaryOf(row as Record<string, unknown>, Boolean(row.closed_at)));
  });
}


/** Which way this conversation happened, for a page that has only its id. */
export async function sessionMode(userId: string, sessionId: string, client: Client = db()): Promise<string | null> {
  const result = await client
    .execute({ sql: "SELECT mode FROM sessions WHERE id = ? AND user_id = ? LIMIT 1", args: [sessionId, userId] })
    .catch(() => null);
  const row = result?.rows[0];
  return row ? String(row.mode) : null;
}

/** Everything that was said, oldest first — the order it is read in. */
export async function sessionTranscript(userId: string, sessionId: string, client: Client = db()): Promise<Transcript> {
  const result = await client.execute({
    sql: `SELECT role, content, correction, created_at FROM messages
          WHERE user_id = ? AND session_id = ? ORDER BY created_at ASC, rowid ASC LIMIT 200`,
    args: [userId, sessionId],
  });
  return result.rows
    .map((row) => ({
      role: String(row.role),
      content: String(row.content),
      correction: row.correction ? String(row.correction) : null,
      at: String(row.created_at),
    }))
    // Conversations recorded before this was fixed still carry the instruction
    // that opened them. Nobody said it, so nobody should have to read it.
    .filter((line) => !(line.role === "user" && isSyntheticOpener(line.content)));
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

import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { ensureProfile } from "./service";
import { isVoiceMode, RESUMABLE_HOURS } from "./sessions";
import { isSyntheticOpener } from "./openers";

/**
 * A spoken conversation, written down while it is still happening.
 *
 * Until now a voice call left one row in `sessions` at the very end and not a
 * single line of what was said: the transcript lived in a React ref and was
 * posted once, on hang-up, only to be read by the extraction of a few
 * mistakes and then thrown away. Two consequences, both reported by testers.
 * A call that ended the way calls actually end — the phone locked, a real
 * call came in, the app was swiped away — left nothing at all, not even the
 * minutes. And a spoken lesson could never be reread, because it had never
 * been written anywhere.
 *
 * So the row is opened when the call starts, the lines are appended as they
 * are said, and hanging up only closes what is already saved. The unit of
 * safety is the flush, not the hang-up.
 */

/**
 * Line ids are derived, not random, so a retried flush writes nothing new.
 *
 * The leg is the one part that has to be there. A conversation can be picked
 * up more than once, and each leg numbers its own lines from zero; without a
 * namespace per leg, line 3 of the second half would claim the id of line 3
 * of the first and OR IGNORE would quietly drop it — data loss disguised as
 * idempotency.
 */
function lineId(sessionId: string, leg: string, seq: number): string {
  return `${sessionId}-${leg}-${seq}`;
}

/** Legs are opaque: anything the caller sends is reduced to safe characters. */
export function safeLeg(leg: string | null | undefined): string {
  const clean = (leg ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  return clean || "a";
}

export type VoiceLine = { role: "you" | "coach"; text: string };

export type ResumedVoiceSession = {
  id: string;
  /** What was already said, for Sam and for the screen. */
  recap: VoiceLine[];
};

/** How much of an interrupted call Sam is reminded of when picking it back up. */
const RECAP_LINES = 8;

/** The tail of a spoken session, oldest first. */
export async function voiceRecap(sessionId: string, limit = RECAP_LINES, client: Client = db()): Promise<VoiceLine[]> {
  const result = await client
    .execute({
      sql: `SELECT role, content FROM messages WHERE session_id = ?
            ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      args: [sessionId, limit],
    })
    .catch(() => null);
  if (!result) return [];
  return result.rows
    .map((row) => ({ role: String(row.role) === "user" ? ("you" as const) : ("coach" as const), text: String(row.content) }))
    .reverse();
}

/**
 * Picking a spoken conversation back up.
 *
 * Nothing is created here: a resume id that is not this learner's, not
 * spoken, or too old is not an error, it just means there is nothing to
 * continue and the call starts fresh — which is what the person asked for in
 * the first place.
 */
export async function resumeVoiceSession(
  userId: string,
  resumeId: string,
  client: Client = db()
): Promise<ResumedVoiceSession | null> {
  const since = new Date(Date.now() - RESUMABLE_HOURS * 3_600_000).toISOString();
  const found = await client
    .execute({
      sql: "SELECT id, mode, started_at FROM sessions WHERE id = ? AND user_id = ? LIMIT 1",
      args: [resumeId, userId],
    })
    .catch(() => null);
  const row = found?.rows[0];
  // Any conversation of theirs, not only a spoken one. Sam asks a question in
  // writing, you tap the microphone to answer it out loud: that is one
  // conversation continuing, and refusing it because the first half was typed
  // is what made the two halves contradict each other on screen.
  if (!row || String(row.started_at) < since) return null;

  const recap = (await voiceRecap(resumeId, RECAP_LINES, client)).filter(
    (line) => !(line.role === "you" && isSyntheticOpener(line.text))
  );
  if (!recap.length) return null;
  // Coming back to it means it is not over, whatever a previous hang-up wrote.
  await client
    .execute({ sql: "UPDATE sessions SET ended_at = NULL WHERE id = ? AND user_id = ?", args: [resumeId, userId] })
    .catch(() => null);
  return { id: resumeId, recap };
}

/**
 * The row a call writes into, created the first time there is something to
 * write.
 *
 * Not when the call starts: a token minted for a call that never connects
 * would leave a session nobody had, and the home screen counts those rows and
 * tells the learner how many conversations they have had. A conversation that
 * exists because a microphone permission was denied is not one of them.
 */
export async function ensureVoiceSession(
  userId: string,
  mode: string,
  sessionId: string | null,
  client: Client = db()
): Promise<string> {
  // The id is the caller's when it looks like one, so a flush that is retried
  // — and the last one always is, because it leaves on a beacon nobody can
  // acknowledge — lands in the same row instead of opening a second one.
  const requested = sessionId && /^[0-9a-fA-F-]{8,64}$/.test(sessionId) ? sessionId : null;

  async function mine(id: string): Promise<boolean> {
    const owned = await client
      .execute({ sql: "SELECT id FROM sessions WHERE id = ? AND user_id = ? LIMIT 1", args: [id, userId] })
      .catch(() => null);
    return Boolean(owned?.rows.length);
  }

  if (requested && (await mine(requested))) return requested;
  await ensureProfile(userId, client);

  const modeName = isVoiceMode(mode) ? mode : "voice";
  const insert = async (id: string) => {
    await client.execute({
      sql: "INSERT OR IGNORE INTO sessions (id, user_id, mode, started_at) VALUES (?, ?, ?, ?)",
      args: [id, userId, modeName, new Date().toISOString()],
    });
  };

  if (requested) {
    await insert(requested);
    // An id already taken by somebody else is not an error to report, it is
    // an id not to write into: OR IGNORE left their row untouched, and this
    // call gets one of its own.
    if (await mine(requested)) return requested;
  }
  const id = randomUUID();
  await insert(id);
  return id;
}

/**
 * Appends what has been said since the last flush.
 *
 * `from` is the caller's own line number, which makes every write idempotent:
 * the same flush sent twice — and it will be, because the last one leaves on
 * a beacon nobody can acknowledge — writes the same rows twice and changes
 * nothing.
 */
export async function appendVoiceLines(
  userId: string,
  sessionId: string,
  leg: string,
  from: number,
  lines: VoiceLine[],
  client: Client = db()
): Promise<number> {
  if (!lines.length) return 0;
  const now = Date.now();
  const statements = lines.map((line, i) => ({
    sql: "INSERT OR IGNORE INTO messages (id, user_id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [
      lineId(sessionId, safeLeg(leg), from + i),
      userId,
      sessionId,
      line.role === "you" ? "user" : "assistant",
      line.text.slice(0, 2000),
      // Spread by a second so the transcript reads back in the order it was
      // spoken: flushed together, they would otherwise share a timestamp and
      // the only tie-break left would be insertion order.
      new Date(now + i * 1000).toISOString(),
    ],
  }));
  await client.batch(statements, "write");
  return statements.length;
}

/** Hanging up. The transcript is already saved; this only marks the end. */
export async function endVoiceSession(userId: string, sessionId: string, client: Client = db()): Promise<void> {
  await client
    .execute({
      sql: "UPDATE sessions SET ended_at = ? WHERE id = ? AND user_id = ?",
      args: [new Date().toISOString(), sessionId, userId],
    })
    .catch(() => null);
}

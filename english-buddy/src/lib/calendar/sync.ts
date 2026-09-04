import type { Client } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { parseIcs, type CalEvent } from "./ics";

/**
 * Keeping the app's list of appointments in step with a real calendar.
 *
 * The address is the private link a calendar publishes itself at — the one
 * setting every calendar has and no API requires. It costs the user one paste
 * and costs us no OAuth, no verification queue, and no access to anything but
 * the calendar they chose to share.
 */

const SCHEMA = `CREATE TABLE IF NOT EXISTS calendar_links (
  user_id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  timezone TEXT,
  last_sync_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL
);`;

let ensured = false;

export async function ensureCalendarSchema(client: Client = db()): Promise<void> {
  if (ensured) return;
  try {
    await client.execute("SELECT source_uid FROM events LIMIT 0");
    await client.execute("SELECT url FROM calendar_links LIMIT 0");
    ensured = true;
    return;
  } catch {
    /* first use, or an events table from before it knew where events came from */
  }
  await client.execute(SCHEMA.trim());
  // Where an event came from, so an imported one is recognised on the next
  // sync instead of arriving again, and what the user wrote about it.
  await client.execute("ALTER TABLE events ADD COLUMN source_uid TEXT").catch(() => {});
  await client.execute("ALTER TABLE events ADD COLUMN notes TEXT").catch(() => {});
  await client
    .execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_events_source ON events(user_id, source_uid)")
    .catch(() => {});
  ensured = true;
}

/** Only for tests, which rebuild the database between cases. */
export function resetCalendarSchemaCache(): void {
  ensured = false;
}

/** How far ahead there is any point preparing. */
export const SYNC_DAYS = 21;
/** A calendar that will not fit in this is not a calendar we can help with. */
const MAX_ICS_BYTES = 4_000_000;

/**
 * Whether we are willing to fetch this.
 *
 * The address comes from the user and is fetched by our server, which is the
 * classic way to get a server to knock on doors only it can reach. So: https
 * only, a real hostname, and nothing that names the machine we are standing
 * on or the network it sits in.
 */
export function safeCalendarUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/^webcal:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return null;
  // A bare address instead of a name: no calendar service publishes that way,
  // and it is how the private ranges get reached.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return null;
  if (!host.includes(".")) return null;
  return url.toString();
}

export type CalendarLink = { url: string; timezone: string; lastSyncAt: string | null; lastError: string | null };

export async function readLink(userId: string, client: Client = db()): Promise<CalendarLink | null> {
  await ensureCalendarSchema(client);
  const result = await client.execute({
    sql: "SELECT url, timezone, last_sync_at, last_error FROM calendar_links WHERE user_id = ? LIMIT 1",
    args: [userId],
  });
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    url: String(row.url),
    timezone: row.timezone ? String(row.timezone) : "Europe/Rome",
    lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null,
    lastError: row.last_error ? String(row.last_error) : null,
  };
}

export async function saveLink(userId: string, url: string, timezone: string, client: Client = db()): Promise<void> {
  await ensureCalendarSchema(client);
  await client.execute({
    sql: `INSERT INTO calendar_links (user_id, url, timezone, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET url = excluded.url, timezone = excluded.timezone, last_error = NULL`,
    args: [userId, url, timezone, new Date().toISOString()],
  });
}

export async function removeLink(userId: string, client: Client = db()): Promise<void> {
  await ensureCalendarSchema(client);
  await client.execute({ sql: "DELETE FROM calendar_links WHERE user_id = ?", args: [userId] });
  // The imported appointments go with it. What the user wrote themselves stays.
  await client.execute({ sql: "DELETE FROM events WHERE user_id = ? AND source_uid IS NOT NULL", args: [userId] });
}

async function fetchCalendar(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: "text/calendar, text/plain" },
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Il calendario ha risposto ${response.status}.`);
  const text = await response.text();
  if (text.length > MAX_ICS_BYTES) throw new Error("Il calendario è troppo grande.");
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Quell'indirizzo non restituisce un calendario.");
  return text;
}

/**
 * Brings the calendar in, without stepping on anything.
 *
 * An appointment already imported is updated in place, so the prepared sheet,
 * the notes and the documents attached to it survive a change of time. One the
 * user wrote by hand is never touched. And an imported one that has vanished
 * from the calendar — the meeting was cancelled — is removed, unless somebody
 * has already prepared for it, in which case it is left alone rather than
 * silently taking their work with it.
 */
export async function syncCalendar(
  userId: string,
  now = new Date(),
  client: Client = db()
): Promise<{ imported: number; updated: number; removed: number }> {
  const link = await readLink(userId, client);
  if (!link) throw new Error("Nessun calendario collegato.");

  let events: CalEvent[];
  try {
    const text = await fetchCalendar(link.url);
    events = parseIcs(text, { from: new Date(now.getTime() - 86_400_000), days: SYNC_DAYS, timeZone: link.timezone });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Non sono riuscito a leggere il calendario.";
    await client.execute({
      sql: "UPDATE calendar_links SET last_error = ?, last_sync_at = ? WHERE user_id = ?",
      args: [message.slice(0, 300), new Date().toISOString(), userId],
    });
    throw error;
  }

  const existing = await client.execute({
    sql: "SELECT id, source_uid, prep_json FROM events WHERE user_id = ? AND source_uid IS NOT NULL",
    args: [userId],
  });
  const known = new Map(existing.rows.map((row) => [String(row.source_uid), row]));
  const seen = new Set<string>();
  let imported = 0, updated = 0, removed = 0;

  for (const event of events) {
    seen.add(event.uid);
    const already = known.get(event.uid);
    if (already) {
      await client.execute({
        sql: "UPDATE events SET title = ?, event_date = ?, event_time = ? WHERE id = ?",
        args: [event.title, event.date, event.time, String(already.id)],
      });
      updated += 1;
      continue;
    }
    await client.execute({
      sql: `INSERT INTO events (id, user_id, title, event_date, event_time, source_uid, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [randomUUID(), userId, event.title, event.date, event.time, event.uid, new Date().toISOString()],
    });
    imported += 1;
  }

  for (const [uid, row] of known) {
    if (seen.has(uid) || row.prep_json) continue;
    await client.execute({ sql: "DELETE FROM events WHERE id = ?", args: [String(row.id)] });
    removed += 1;
  }

  await client.execute({
    sql: "UPDATE calendar_links SET last_sync_at = ?, last_error = NULL WHERE user_id = ?",
    args: [new Date().toISOString(), userId],
  });
  return { imported, updated, removed };
}

export async function saveNotes(userId: string, eventId: string, notes: string, client: Client = db()): Promise<void> {
  await ensureCalendarSchema(client);
  await client.execute({
    sql: "UPDATE events SET notes = ? WHERE id = ? AND user_id = ?",
    args: [notes.slice(0, 2000), eventId, userId],
  });
}

export async function readNotes(userId: string, eventId: string, client: Client = db()): Promise<string> {
  await ensureCalendarSchema(client);
  const result = await client
    .execute({ sql: "SELECT notes FROM events WHERE id = ? AND user_id = ? LIMIT 1", args: [eventId, userId] })
    .catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return result.rows[0]?.notes ? String(result.rows[0].notes) : "";
}

/** Every account with a calendar attached, for the nightly refresh. */
export async function linkedUsers(client: Client = db()): Promise<string[]> {
  await ensureCalendarSchema(client);
  const result = await client.execute("SELECT user_id FROM calendar_links");
  return result.rows.map((row) => String(row.user_id));
}

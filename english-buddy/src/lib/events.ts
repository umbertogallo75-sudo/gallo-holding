import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { prepSchema, type EventPrep } from "@/lib/ai/prep";

/**
 * The appointments a user is preparing for. Kept deliberately thin: a line of
 * their own words, a date, and the prepared material as JSON — the shape of
 * that material will change as the feature grows, and a column per field would
 * make every change a migration.
 */

export type UserEvent = {
  id: string;
  title: string;
  date: string;
  time: string | null;
  prep: EventPrep | null;
  remindedAt: string | null;
};

const SCHEMA = `CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_time TEXT,
  prep_json TEXT,
  reminded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_events_upcoming ON events(user_id, event_date);`;

function toEvent(row: Record<string, unknown>): UserEvent {
  let prep: EventPrep | null = null;
  if (row.prep_json) {
    const parsed = prepSchema.safeParse(JSON.parse(String(row.prep_json)));
    if (parsed.success) prep = parsed.data;
  }
  return {
    id: String(row.id),
    title: String(row.title),
    date: String(row.event_date),
    time: row.event_time ? String(row.event_time) : null,
    prep,
    remindedAt: row.reminded_at ? String(row.reminded_at) : null,
  };
}

export async function createEvent(
  userId: string,
  title: string,
  date: string,
  time: string | null,
  prep: EventPrep,
  client: Client = db()
): Promise<string> {
  const id = randomUUID();
  const insert = () =>
    client.execute({
      sql: "INSERT INTO events (id, user_id, title, event_date, event_time, prep_json) VALUES (?, ?, ?, ?, ?, ?)",
      args: [id, userId, title, date, time, JSON.stringify(prep)],
    });
  try {
    await insert();
  } catch {
    await client.executeMultiple(SCHEMA);
    await insert();
  }
  return id;
}

/** Today's and future appointments, soonest first. */
export async function upcomingEvents(userId: string, today: string, client: Client = db()): Promise<UserEvent[]> {
  const result = await client
    .execute({
      sql: "SELECT * FROM events WHERE user_id = ? AND event_date >= ? ORDER BY event_date ASC, event_time ASC LIMIT 20",
      args: [userId, today],
    })
    .catch(() => null);
  return result ? result.rows.map((row) => toEvent(row as unknown as Record<string, unknown>)) : [];
}

export async function getEvent(userId: string, id: string, client: Client = db()): Promise<UserEvent | null> {
  const result = await client
    .execute({ sql: "SELECT * FROM events WHERE user_id = ? AND id = ? LIMIT 1", args: [userId, id] })
    .catch(() => null);
  const row = result?.rows[0];
  return row ? toEvent(row as unknown as Record<string, unknown>) : null;
}

export async function deleteEvent(userId: string, id: string, client: Client = db()): Promise<void> {
  await client.execute({ sql: "DELETE FROM events WHERE user_id = ? AND id = ?", args: [userId, id] }).catch(() => undefined);
}

/**
 * Appointments happening tomorrow whose reminder has not gone out. The day
 * before is the moment the reminder is worth something: still time to prepare,
 * close enough that it matters.
 */
export async function eventsToRemind(tomorrow: string, client: Client = db()): Promise<{ userId: string; event: UserEvent }[]> {
  const result = await client
    .execute({
      sql: "SELECT * FROM events WHERE event_date = ? AND reminded_at IS NULL LIMIT 200",
      args: [tomorrow],
    })
    .catch(() => null);
  if (!result) return [];
  return result.rows.map((row) => ({
    userId: String(row.user_id),
    event: toEvent(row as unknown as Record<string, unknown>),
  }));
}

export async function markReminded(id: string, when: string, client: Client = db()): Promise<void> {
  await client.execute({ sql: "UPDATE events SET reminded_at = ? WHERE id = ?", args: [when, id] }).catch(() => undefined);
}

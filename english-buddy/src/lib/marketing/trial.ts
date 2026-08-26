import type { Client } from "@libsql/client";
import { db } from "@/lib/db";

/**
 * The free trial the welcome email hands out.
 *
 * 24 hours on the click, and another 24 the moment the path is actually
 * walked — onboarding answered and ten minutes of real practice. Then the
 * paywall, exactly as before: this grants access, it never sells anything.
 *
 * The extension is worked out on read rather than by a scheduled job. A
 * trial that expires at 03:00 must not stay expired until an hourly pass
 * happens to notice that the person had earned another day at 02:58.
 */
const SCHEMA = `CREATE TABLE IF NOT EXISTS trials (
  user_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  ends_at TEXT NOT NULL,
  extended_at TEXT
);`;

export const TRIAL_MS = 24 * 60 * 60 * 1000;
/** Ten minutes of practice, the same threshold as the evening recap. */
export const TRIAL_MINUTES_REQUIRED = 10;

export type Trial = {
  startedAt: Date;
  endsAt: Date;
  extended: boolean;
  active: boolean;
  msLeft: number;
};

function parseStamp(value: unknown): Date {
  // SQLite writes "YYYY-MM-DD HH:MM:SS" in UTC; ISO strings come back as-is.
  const raw = String(value ?? "");
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
  return new Date(iso);
}

async function heal(client: Client) {
  try {
    await client.executeMultiple(SCHEMA);
  } catch { /* concurrent create */ }
}

function toTrial(row: Record<string, unknown>, now: Date): Trial {
  const endsAt = parseStamp(row.ends_at);
  const msLeft = endsAt.getTime() - now.getTime();
  return {
    startedAt: parseStamp(row.started_at),
    endsAt,
    extended: Boolean(row.extended_at),
    active: msLeft > 0,
    msLeft: Math.max(0, msLeft),
  };
}

/**
 * Starts the trial. Idempotent: clicking the link in the welcome email twice,
 * or on two devices, is one trial — otherwise the email would be a renewable
 * subscription to free access.
 */
export async function grantTrial(userId: string, client: Client = db(), now: Date = new Date()): Promise<Trial | null> {
  const endsAt = new Date(now.getTime() + TRIAL_MS).toISOString();
  const insert = () =>
    client.execute({
      sql: "INSERT OR IGNORE INTO trials (user_id, started_at, ends_at) VALUES (?, ?, ?)",
      args: [userId, now.toISOString(), endsAt],
    });
  try {
    await insert();
  } catch {
    await heal(client);
    try {
      await insert();
    } catch {
      return null;
    }
  }
  return readTrial(userId, client, now);
}

/** Onboarding answered, and ten minutes of practice actually done. */
export async function hasCompletedModules(userId: string, client: Client = db()): Promise<boolean> {
  try {
    const result = await client.execute({
      sql: `SELECT (SELECT onboarding_done_at FROM profiles WHERE id = ?) AS done,
                   (SELECT COALESCE(SUM(minutes_practiced), 0) FROM daily_metrics WHERE user_id = ?) AS minutes`,
      args: [userId, userId],
    });
    const row = result.rows[0];
    if (!row?.done) return false;
    return Number(row.minutes ?? 0) >= TRIAL_MINUTES_REQUIRED;
  } catch {
    // A missing onboarding column means the migration has not run. Not having
    // earned the extension is the safe answer; it is never the reason someone
    // loses access they already have.
    return false;
  }
}

/**
 * The trial as it stands, extending it first if that has been earned. Returns
 * null for anyone who never started one.
 */
export async function readTrial(userId: string, client: Client = db(), now: Date = new Date()): Promise<Trial | null> {
  let result;
  try {
    result = await client.execute({ sql: "SELECT * FROM trials WHERE user_id = ? LIMIT 1", args: [userId] });
  } catch {
    await heal(client);
    return null;
  }
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const trial = toTrial(row, now);
  if (trial.extended) return trial;
  if (!(await hasCompletedModules(userId, client))) return trial;

  // Earned: a second day, measured from the end of the first, so finishing
  // the modules early is not quietly punished by losing the hours in between.
  const extendedEnd = new Date(trial.endsAt.getTime() + TRIAL_MS).toISOString();
  try {
    await client.execute({
      sql: "UPDATE trials SET ends_at = ?, extended_at = ? WHERE user_id = ? AND extended_at IS NULL",
      args: [extendedEnd, now.toISOString(), userId],
    });
  } catch {
    return trial;
  }
  return { ...trial, endsAt: new Date(extendedEnd), extended: true, active: true, msLeft: new Date(extendedEnd).getTime() - now.getTime() };
}

export function hoursLeft(trial: Trial): number {
  return Math.max(0, Math.ceil(trial.msLeft / (60 * 60 * 1000)));
}

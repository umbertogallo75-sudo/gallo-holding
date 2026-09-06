import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { trackEvent } from "@/lib/analytics";

/**
 * The free week every account starts with.
 *
 * It used to be twenty-four hours, handed out by a link in the welcome email
 * and a button on the home screen, with a second day to be earned by finishing
 * the onboarding. Three ways to not get it, and a promise too complicated to
 * put on a poster. It is now one sentence — *la prima settimana è gratis* —
 * and it starts by itself the moment an account exists, because an offer
 * somebody has to find is an offer most people never receive.
 *
 * Seven days of everything, then the paywall. This grants access; it never
 * sells anything, and nothing is charged when it ends.
 */
const SCHEMA = `CREATE TABLE IF NOT EXISTS trials (
  user_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  ends_at TEXT NOT NULL,
  extended_at TEXT
);`;

export const TRIAL_DAYS = 7;
export const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

export type Trial = {
  startedAt: Date;
  endsAt: Date;
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

function toTrial(startedAt: Date, endsAt: Date, now: Date): Trial {
  const msLeft = endsAt.getTime() - now.getTime();
  return { startedAt, endsAt, active: msLeft > 0, msLeft: Math.max(0, msLeft) };
}

/**
 * Starts the week. Idempotent: registering, then opening a conversation, then
 * clicking the link in the welcome email is one trial and not three, otherwise
 * the offer would be a renewable subscription to free access.
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
  const trial = await readTrial(userId, client, now);
  // Recorded here rather than at any of the doors that lead here, so the
  // count is of trials that exist, not of buttons that were pressed.
  if (trial && Math.abs(trial.startedAt.getTime() - now.getTime()) < 5_000) {
    await trackEvent("trial_started", { userId }, client);
  }
  return trial;
}

/**
 * The trial as it stands. Returns null for anyone who never started one.
 *
 * A trial shorter than a week is one of the old twenty-four hour ones, and it
 * is lengthened here to the new promise rather than left to expire under the
 * old one. Doing it on read rather than in a migration means it holds for
 * whoever comes back next month too, and nobody is worse off for having
 * arrived early.
 */
export async function readTrial(userId: string, client: Client = db(), now: Date = new Date()): Promise<Trial | null> {
  let result;
  try {
    result = await client.execute({ sql: "SELECT started_at, ends_at FROM trials WHERE user_id = ? LIMIT 1", args: [userId] });
  } catch {
    await heal(client);
    return null;
  }
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const startedAt = parseStamp(row.started_at);
  const endsAt = parseStamp(row.ends_at);
  const full = new Date(startedAt.getTime() + TRIAL_MS);
  if (endsAt.getTime() >= full.getTime()) return toTrial(startedAt, endsAt, now);

  try {
    await client.execute({
      sql: "UPDATE trials SET ends_at = ? WHERE user_id = ? AND ends_at < ?",
      args: [full.toISOString(), userId, full.toISOString()],
    });
  } catch {
    // The old end still stands if the write fails; better a short trial than
    // an error on the page that reads it.
    return toTrial(startedAt, endsAt, now);
  }
  return toTrial(startedAt, full, now);
}

/**
 * Starts the week if it has not started already.
 *
 * Called the moment an account is created — password, Google or Apple — and
 * again the first time somebody actually talks to the coach, which covers the
 * accounts that existed before any of this.
 */
export async function ensureTrial(userId: string, client: Client = db(), now: Date = new Date()): Promise<Trial | null> {
  const existing = await readTrial(userId, client, now);
  if (existing) return existing;
  return grantTrial(userId, client, now);
}

export function hoursLeft(trial: Trial): number {
  return Math.max(0, Math.ceil(trial.msLeft / (60 * 60 * 1000)));
}

/** Whole days, rounded up: "ti restano 3 giorni" on the last hours of day 3. */
export function daysLeft(trial: Trial): number {
  return Math.max(0, Math.ceil(trial.msLeft / (24 * 60 * 60 * 1000)));
}

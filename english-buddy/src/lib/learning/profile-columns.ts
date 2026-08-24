import type { Client } from "@libsql/client";
import { db } from "@/lib/db";

/**
 * The two columns migration 0023 adds, created on demand if the migration has
 * not run yet.
 *
 * Mirrors db/migrations/0023_onboarding.sql, and exists for one reason: code
 * and database do not deploy at the same instant. Without this, a release that
 * lands before `npm run db:migrate` turns the home screen and onboarding into
 * a 500 for everybody — the two screens this whole change was meant to fix.
 *
 * SQLite has no ADD COLUMN IF NOT EXISTS, so each statement runs on its own
 * and a failure is the expected answer when the column is already there.
 */
const COLUMNS = [
  "ALTER TABLE profiles ADD COLUMN daily_minutes INTEGER NOT NULL DEFAULT 5",
  "ALTER TABLE profiles ADD COLUMN onboarding_done_at TEXT",
];

let healed = false;

export async function healProfileColumns(client: Client = db()): Promise<void> {
  if (healed) return;
  for (const sql of COLUMNS) {
    await client.execute(sql).catch(() => undefined);
  }
  healed = true;
}

/**
 * Reads a profile, adding the columns first if the read fails because they are
 * missing. The retry happens once per process, not once per request.
 */
export async function readProfile(sql: string, userId: string, client: Client = db()) {
  try {
    return await client.execute({ sql, args: [userId] });
  } catch (error) {
    await healProfileColumns(client);
    // If it fails again the problem is not the missing columns, so let it out.
    void error;
    return client.execute({ sql, args: [userId] });
  }
}

import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { isEmailConfigured } from "@/lib/email";
import { unsubscribedIds } from "./prefs";
import { dailyKey, isRealAddress, onceKey, sendMarketing, type Sender } from "./send";
import { comeBack, eveningRecap, trialEnded, trialExtended, trialReminder } from "./templates";
import { hoursLeft, readTrial } from "./trial";

/**
 * The hourly pass that decides who hears from Sam today.
 *
 * Everything is loaded in a handful of aggregate queries rather than a few
 * per person: this runs inside the same 60-second budget as the push
 * scheduler, and a per-user round trip is what turns a working cron into one
 * that quietly stops finishing.
 */

const MAX_SENDS_PER_RUN = 60;
/** Daytime in Italy. Nobody wants a marketing email at four in the morning. */
const DAY_START_UTC = 7;
const DAY_END_UTC = 20;
/** The recap is about the day just spent, so it goes out as it ends. */
const EVENING_START_UTC = 17;
const EVENING_END_UTC = 20;

/** Silence long enough to be a lapse rather than a busy Tuesday. */
const COME_BACK_HOURS = 72;
/** Ten minutes: the same bar the trial extension uses. One promise, one number. */
const RECAP_MINUTES = 10;
/** The last hours of the trial, when a nudge can still change the outcome. */
const REMINDER_WINDOW_MS = 6 * 60 * 60 * 1000;

export type LifecycleReport = Record<string, number | string>;

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseStamp(value: unknown): number {
  const raw = String(value ?? "");
  if (!raw) return NaN;
  return Date.parse(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z");
}

/** Consecutive days with practice, counting back from today. */
export function streakFrom(days: Set<string>, today: Date): number {
  let streak = 0;
  const cursor = new Date(today.getTime());
  while (days.has(day(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export async function runLifecycleEmails(
  client: Client = db(),
  now: Date = new Date(),
  send: Sender | null = null
): Promise<LifecycleReport> {
  if (!send && !isEmailConfigured()) return { skipped: "config" };
  const hour = now.getUTCHours();
  if (hour < DAY_START_UTC || hour >= DAY_END_UTC) return { skipped: "quiet-hours" };
  const evening = hour >= EVENING_START_UTC && hour < EVENING_END_UTC;

  const [users, lastSessions, metrics, billing, optedOut] = await Promise.all([
    client.execute("SELECT id, email, display_name FROM auth_users WHERE email IS NOT NULL AND email != ''"),
    client.execute("SELECT user_id, MAX(ended_at) AS last_at FROM sessions GROUP BY user_id").catch(() => ({ rows: [] })),
    client
      .execute({
        sql: "SELECT user_id, day, minutes_practiced, expressions_reviewed FROM daily_metrics WHERE day >= ?",
        args: [day(new Date(now.getTime() - 40 * 86_400_000))],
      })
      .catch(() => ({ rows: [] })),
    client.execute("SELECT user_id, plan, status FROM billing").catch(() => ({ rows: [] })),
    unsubscribedIds(client),
  ]);

  const lastSessionAt = new Map<string, number>();
  for (const row of lastSessions.rows) lastSessionAt.set(String(row.user_id), parseStamp(row.last_at));

  const today = day(now);
  const todayStats = new Map<string, { minutes: number; expressions: number }>();
  const practisedDays = new Map<string, Set<string>>();
  for (const row of metrics.rows) {
    const userId = String(row.user_id);
    const minutes = Number(row.minutes_practiced ?? 0);
    if (String(row.day) === today) {
      todayStats.set(userId, { minutes, expressions: Number(row.expressions_reviewed ?? 0) });
    }
    if (minutes > 0) {
      const set = practisedDays.get(userId) ?? new Set<string>();
      set.add(String(row.day));
      practisedDays.set(userId, set);
    }
  }

  const paying = new Set(
    billing.rows.filter((row) => String(row.status) === "active").map((row) => String(row.user_id))
  );

  const counts: Record<string, number> = { reminder: 0, extended: 0, ended: 0, comeback: 0, recap: 0 };
  let sends = 0;

  for (const row of users.rows) {
    if (sends >= MAX_SENDS_PER_RUN) break;
    const userId = String(row.id);
    const email = row.email ? String(row.email) : null;
    if (!isRealAddress(email) || optedOut.has(userId)) continue;
    const name = row.display_name ? String(row.display_name) : null;

    // Reading the trial is also what extends it, so this call is the moment a
    // completed first day turns into a second one.
    const trial = await readTrial(userId, client, now);

    let kind: string | null = null;
    let claimKey = "";
    let message = null;

    if (trial?.extended) {
      kind = "trial_extended";
      claimKey = onceKey(userId, kind);
      message = trialExtended(userId, name);
    } else if (trial?.active && trial.msLeft <= REMINDER_WINDOW_MS) {
      kind = "trial_reminder";
      claimKey = onceKey(userId, kind);
      message = trialReminder(userId, name, hoursLeft(trial));
    } else if (trial && !trial.active && !paying.has(userId)) {
      kind = "trial_ended";
      claimKey = onceKey(userId, kind);
      message = trialEnded(userId, name);
    }

    // The evening recap is the one email that celebrates rather than asks, so
    // it outranks whatever else was queued for today: being congratulated and
    // sold to in the same hour reads as insincere.
    const stats = todayStats.get(userId);
    if (evening && stats && stats.minutes >= RECAP_MINUTES) {
      kind = "evening_recap";
      claimKey = dailyKey(userId, kind, today);
      message = eveningRecap(userId, name, {
        minutes: stats.minutes,
        streak: streakFrom(practisedDays.get(userId) ?? new Set(), now),
        expressions: stats.expressions,
      });
    }

    if (!kind) {
      // Nothing pending: has this person simply gone quiet?
      const last = lastSessionAt.get(userId);
      const silentFor = Number.isFinite(last) ? now.getTime() - (last as number) : NaN;
      if (Number.isFinite(silentFor) && silentFor >= COME_BACK_HOURS * 3_600_000) {
        kind = "come_back";
        // At most one per calendar month, so a lapsed account is reminded
        // again months later without ever becoming a weekly drip.
        claimKey = dailyKey(userId, kind, today.slice(0, 7));
        message = comeBack(userId, name, Math.floor(silentFor / 86_400_000));
      }
    }

    if (!kind || !message) continue;
    const result = await sendMarketing({ userId, email, kind, claimKey, message }, client, send ?? undefined);
    if (result === "sent") {
      sends++;
      const bucket = kind.replace("trial_", "").replace("come_back", "comeback").replace("evening_recap", "recap");
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
  }

  return { ...counts, considered: users.rows.length };
}

import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { isEmailConfigured } from "@/lib/email";
import { unsubscribedIds } from "./prefs";
import { dailyKey, isRealAddress, onceKey, sendMarketing, type Sender } from "./send";
import { eveningRecap, trialEnded, trialExtended, trialReminder, winBack } from "./templates";
import { winBackFor, winBackKey, winBackKind } from "./winback";
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
/** At most one automatic email per person per day, whatever is queued. */
const THROTTLE_HOURS = 20;
/** Daytime in Italy. Nobody wants a marketing email at four in the morning. */
const DAY_START_UTC = 7;
const DAY_END_UTC = 20;
/** The recap is about the day just spent, so it goes out as it ends. */
const EVENING_START_UTC = 17;
const EVENING_END_UTC = 20;

/** Ten minutes: the same bar the trial extension uses. One promise, one number. */
const RECAP_MINUTES = 10;
/** The last hours of the trial, when a nudge can still change the outcome. */
const REMINDER_WINDOW_MS = 6 * 60 * 60 * 1000;

export type LifecycleReport = Record<string, number | string>;

/**
 * The day the automatic emails are allowed to start.
 *
 * Two jobs, and the second is the one that matters. It stops anything going
 * out before the date — but it is also the earliest moment silence is counted
 * from, so nobody arrives at the opening bell already twenty days lapsed and
 * receives the harshest letter in the set as their first contact. On the
 * start date everybody stands at day zero; the soft letter can then reach a
 * genuinely quiet account three days later, in the right order.
 */
export function lifecycleStart(): Date {
  // Moved from 1 to 15 September: the sending domain had no history at all
  // and the first four messages went to spam. Ten days of warming, with
  // Postmaster Tools watching, before anything automatic starts.
  const fallback = new Date("2026-09-15T00:00:00Z");
  const raw = process.env.LIFECYCLE_START_AT?.trim();
  if (!raw) return fallback;
  const at = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(at.getTime()) ? fallback : at;
}

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
  const start = lifecycleStart();
  if (now < start) return { skipped: "before-start", start: start.toISOString().slice(0, 10) };
  const hour = now.getUTCHours();
  if (hour < DAY_START_UTC || hour >= DAY_END_UTC) return { skipped: "quiet-hours" };
  const evening = hour >= EVENING_START_UTC && hour < EVENING_END_UTC;

  const [users, lastSessions, metrics, billing, optedOut] = await Promise.all([
    client.execute("SELECT id, email, display_name, created_at FROM auth_users WHERE email IS NOT NULL AND email != ''"),
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

  const counts: Record<string, number> = { reminder: 0, extended: 0, ended: 0, recap: 0, win_back_soft: 0, win_back_firm: 0, win_back_hard: 0, win_back_reminder: 0 };
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

    // Only while it is still running. Without the second half this branch
    // caught every extended trial for ever, and the closing email became
    // unreachable for exactly the people who had engaged most — the ones who
    // finished the path and earned the extra day.
    if (trial?.extended && trial.active) {
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
      // Nothing pending: has this person gone quiet, and for how long?
      //
      // Never having practised at all counts from the day they registered.
      // Someone who signed up and never opened the app is not outside the
      // ladder — they are the clearest case for it.
      const last = lastSessionAt.get(userId);
      const registered = parseStamp(row.created_at);
      const seen = Number.isFinite(last) ? (last as number) : registered;
      // Never earlier than the opening date. Somebody who went quiet weeks
      // before this system existed has not ignored anything — writing to them
      // as if they had would be untrue, and the worst possible first contact.
      const lastSeen = Number.isFinite(seen) ? Math.max(seen, start.getTime()) : NaN;
      if (Number.isFinite(lastSeen)) {
        const days = Math.floor((now.getTime() - lastSeen) / 86_400_000);
        const step = winBackFor(days);
        if (step) {
          kind = winBackKind(step);
          // The day they were last seen is part of the key, so coming back
          // and drifting away again starts the ladder from the beginning
          // instead of finding every rung already spent.
          claimKey = winBackKey(userId, step, day(new Date(lastSeen)));
          message = winBack(userId, name, step, days);
        }
      }
    }

    if (!kind || !message) continue;
    // A reward that has just been earned arrives now; everything else waits
    // its turn, so nobody gets two automatic emails in a day.
    const throttleHours = kind === "trial_extended" ? undefined : THROTTLE_HOURS;
    const result = await sendMarketing({ userId, email, kind, claimKey, message, throttleHours, now }, client, send ?? undefined);
    if (result === "sent") {
      sends++;
      const bucket = kind.startsWith("win_back") ? kind : kind.replace("trial_", "").replace("evening_recap", "recap");
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
  }

  return { ...counts, considered: users.rows.length };
}

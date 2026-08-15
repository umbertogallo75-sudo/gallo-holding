import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shouldSend, type Intensity } from "@/lib/push/windows";
import { bannerForNotification, generateBuddyQuestion } from "@/lib/push/content";
import { sendPushToUser } from "@/lib/push/sender";
import { runUpgradeNudges } from "@/lib/nudges";
import { eventsToDebrief, eventsToRemind, markDebriefAsked, markReminded } from "@/lib/events";
import { refreshGoogleSubscriptions } from "@/lib/playstore";

export const maxDuration = 60;

/**
 * Users handled at once. Each one costs a few seconds, almost all of it spent
 * waiting on the model that writes the question, so they overlap well. The cap
 * keeps the database and the model provider from being hit all at once.
 */
const CONCURRENCY = 10;

/**
 * When to stop starting new users, leaving room for the nudges, the Google
 * renewal refresh and the response inside the 60-second budget. Whoever is
 * left over is reported rather than silently dropped — and the next hourly run
 * picks them up, since the window dedupe means nobody gets two.
 */
const START_DEADLINE_MS = 42_000;

/** Runs `task` over `items`, at most `limit` at a time, in arrival order. */
async function pool<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      await task(items[next++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Notification scheduler, invoked hourly by GitHub Actions (plus a daily
 * Vercel cron as backup). For every user with at least one push subscription
 * it checks timezone, intensity, quiet hours and the per-window dedupe, then
 * sends one natural Buddy question with a deep link into the conversation.
 */
async function run(request: Request) {
  // Trim both sides: env values pasted from mobile clipboards often carry
  // stray whitespace/newlines.
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const authorization = (request.headers.get("authorization") ?? "").trim();
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: "Unauthorized", configured: Boolean(secret), secretLength: secret.length },
      { status: 401 }
    );
  }

  const database = db();
  const now = new Date();
  // Web-push subscribers plus native wrapper devices (iOS APNs, Android FCM).
  const users = await database
    .execute(
      `SELECT user_id, MIN(timezone) AS sub_timezone FROM (
         SELECT user_id, timezone FROM push_subscriptions
         UNION ALL
         SELECT user_id, timezone FROM apns_tokens
         UNION ALL
         SELECT user_id, timezone FROM fcm_tokens
       ) GROUP BY user_id`
    )
    .catch(() =>
      database.execute("SELECT DISTINCT user_id, MIN(timezone) AS sub_timezone FROM push_subscriptions GROUP BY user_id")
    );

  // Which channel each user can actually be reached on. "sent" only says the
  // send was attempted, so without this a user subscribed on the old web-push
  // endpoint — and on no app — looks identical to one holding a live phone.
  const devices: Record<string, string> = {};
  try {
    const counts = await database.execute(
      `SELECT user_id, source, COUNT(*) AS n FROM (
         SELECT user_id, 'web' AS source FROM push_subscriptions
         UNION ALL SELECT user_id, 'ios' FROM apns_tokens
         UNION ALL SELECT user_id, 'android' FROM fcm_tokens
       ) GROUP BY user_id, source`
    );
    for (const row of counts.rows) {
      const id = String(row.user_id);
      devices[id] = `${devices[id] ? `${devices[id]} ` : ""}${row.source}:${row.n}`;
    }
  } catch (error) {
    console.error("device census failed:", error);
  }

  const results: Record<string, string> = {};
  const stopStartingAt = Date.now() + START_DEADLINE_MS;
  await pool(users.rows, CONCURRENCY, async (row) => {
    const userId = String(row.user_id);
    if (Date.now() > stopStartingAt) {
      results[userId] = "skipped:deadline";
      return;
    }
    try {
      const [profileResult, stateResult] = await Promise.all([
        database.execute({
          sql: "SELECT display_name, timezone, notification_intensity, quiet_hours_start, quiet_hours_end, professional_context FROM profiles WHERE id = ? LIMIT 1",
          args: [userId],
        }),
        database.execute({ sql: "SELECT cefr_level FROM learning_state WHERE user_id = ? LIMIT 1", args: [userId] }),
      ]);
      const profile = profileResult.rows[0];
      if (!profile) {
        results[userId] = "skipped:no-profile";
        return;
      }

      const timeZone = String(profile.timezone || row.sub_timezone || "Europe/Rome");
      const intensity = (["low", "normal", "immersive"].includes(String(profile.notification_intensity))
        ? String(profile.notification_intensity)
        : "immersive") as Intensity;

      // Recent kinds cover today in any timezone; kind embeds the local date.
      const recent = await database.execute({
        sql: "SELECT kind, prompt FROM notification_history WHERE user_id = ? AND sent_at >= ? ORDER BY sent_at DESC LIMIT 30",
        args: [userId, new Date(now.getTime() - 48 * 3600_000).toISOString()],
      });

      const due = shouldSend({
        now,
        timeZone,
        intensity,
        quietStart: Number(profile.quiet_hours_start ?? 22),
        quietEnd: Number(profile.quiet_hours_end ?? 7),
        alreadySentKinds: new Set(recent.rows.map((r) => String(r.kind))),
      });
      if (!due) {
        results[userId] = "skipped:not-due";
        return;
      }

      const dueExpressionResult = await database.execute({
        sql: "SELECT expression FROM expressions WHERE user_id = ? AND mastered = 0 AND next_review_at <= ? ORDER BY next_review_at ASC LIMIT 1",
        args: [userId, now.toISOString()],
      });

      const question = await generateBuddyQuestion(
        {
          name: profile.display_name ? String(profile.display_name) : null,
          level: stateResult.rows[0]?.cefr_level ? String(stateResult.rows[0].cefr_level) : null,
          professionalContext: profile.professional_context ? String(profile.professional_context) : null,
          recentQuestions: recent.rows.map((r) => String(r.prompt ?? "")).filter(Boolean),
          dueExpression: dueExpressionResult.rows[0]?.expression ? String(dueExpressionResult.rows[0].expression) : null,
        },
        `${userId}:${due.kind}`
      );

      const notificationId = randomUUID();
      const delivered = await sendPushToUser(userId, {
        title: "Sam · ExecLingo",
        body: question,
        image: bannerForNotification({ question, window: due.window, kind: due.kind, seed: notificationId }),
        data: {
          url: `/buddy?mode=buddy&q=${encodeURIComponent(question)}&nid=${notificationId}`,
          nid: notificationId,
        },
      });

      if (delivered > 0) {
        await database.execute({
          sql: "INSERT INTO notification_history (id, user_id, kind, prompt, sent_at) VALUES (?, ?, ?, ?, ?)",
          args: [notificationId, userId, due.kind, question, now.toISOString()],
        });
        results[userId] = `sent:${due.window}`;
      } else {
        results[userId] = "skipped:no-live-subscriptions";
      }
    } catch (error) {
      console.error(`scheduler failed for user ${userId}:`, error);
      results[userId] = "error";
    }
  });

  // "Tomorrow you have the call with the Germans." The one notification the
  // user is glad to get, because it arrives while there is still time to do
  // something about it.
  let reminders = 0;
  try {
    const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
    for (const { userId, event } of await eventsToRemind(tomorrow, database)) {
      const delivered = await sendPushToUser(userId, {
        title: "Sam · ExecLingo",
        body: `Domani: ${event.title}. Cinque minuti di ripasso adesso?`,
        data: { url: `/prepara/${event.id}` },
      }).catch(() => 0);
      if (delivered > 0) {
        await markReminded(event.id, now.toISOString(), database);
        reminders++;
      }
    }
  } catch (error) {
    console.error("event reminders failed:", error);
  }

  // "How did it go?" — asked the same evening, while it is still fresh. A
  // week later nobody remembers what they failed to say.
  let debriefs = 0;
  try {
    const today = now.toISOString().slice(0, 10);
    for (const { userId, event } of await eventsToDebrief(today, database)) {
      const zone = await database
        .execute({ sql: "SELECT timezone FROM profiles WHERE id = ? LIMIT 1", args: [userId] })
        .then((r) => (r.rows[0]?.timezone ? String(r.rows[0].timezone) : "Europe/Rome"))
        .catch(() => "Europe/Rome");
      const localHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hour12: false }).format(now));
      if (localHour < 18) continue;
      const delivered = await sendPushToUser(userId, {
        title: "Sam · ExecLingo",
        body: `Com'è andata: ${event.title}? Due minuti e ne ricaviamo qualcosa.`,
        data: { url: `/prepara/${event.id}` },
      }).catch(() => 0);
      if (delivered > 0) {
        await markDebriefAsked(event.id, now.toISOString(), database);
        debriefs++;
      }
    }
  } catch (error) {
    console.error("debrief prompts failed:", error);
  }

  // Netflix-style upgrade emails for locked accounts (idempotent per user).
  let nudges: Record<string, number | string> = {};
  try {
    nudges = await runUpgradeNudges(database, now);
  } catch (error) {
    console.error("upgrade nudges failed:", error);
    nudges = { error: "failed" };
  }

  // Google Play renewals: no webhook wired, so nearly-expired subs re-verify here.
  let googleSubs: Record<string, number> = {};
  try {
    googleSubs = await refreshGoogleSubscriptions(database, now);
  } catch (error) {
    console.error("google subscription refresh failed:", error);
  }

  return NextResponse.json({ ok: true, at: now.toISOString(), users: users.rows.length, devices, results, reminders, debriefs, nudges, googleSubs });
}

export async function POST(request: Request) {
  return run(request);
}

// Vercel cron invokes with GET.
export async function GET(request: Request) {
  return run(request);
}

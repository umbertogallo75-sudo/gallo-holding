import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shouldSend, type Intensity } from "@/lib/push/windows";
import { bannerForNotification, generateBuddyQuestion } from "@/lib/push/content";
import { sendPushToUser } from "@/lib/push/sender";

export const maxDuration = 60;

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
  const users = await database.execute(
    "SELECT DISTINCT user_id, MIN(timezone) AS sub_timezone FROM push_subscriptions GROUP BY user_id"
  );

  const results: Record<string, string> = {};
  for (const row of users.rows) {
    const userId = String(row.user_id);
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
        continue;
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
        continue;
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
  }

  return NextResponse.json({ ok: true, at: now.toISOString(), users: users.rows.length, results });
}

export async function POST(request: Request) {
  return run(request);
}

// Vercel cron invokes with GET.
export async function GET(request: Request) {
  return run(request);
}

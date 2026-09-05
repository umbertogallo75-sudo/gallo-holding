import webpush from "web-push";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { sendApnsToUser } from "@/lib/push/apns";
import { sendFcmToUser } from "@/lib/push/fcm";

let configured = false;

/**
 * Configures web-push, or reports that it cannot be.
 *
 * It used to throw, and it was the first thing this module did — so a missing
 * VAPID key took the phone apps down with the browsers, which have nothing to
 * do with each other.
 */
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  image?: string;
  data: { url: string; nid?: string };
};

/** What happened, not just how many: a zero with no reason costs an evening. */
export type PushOutcome = { delivered: number; problems: string[] };

/**
 * Consecutive failures a browser subscription is allowed before it is dropped.
 *
 * A push service answers 404 or 410 when a subscription is genuinely gone, and
 * those are removed on the spot. But it answers 403 when the subscription was
 * created against a different VAPID key — after a key rotation, say — and that
 * one never recovers and never gets cleaned up: two accounts here had been
 * retried at every run for days, counted as subscribers, reached by nothing.
 * Counting the failures instead of trusting the status code covers both, and
 * five in a row is far more than any outage lasts.
 */
export const MAX_PUSH_FAILURES = 5;

let failureColumn: boolean | null = null;

/** The failure counter, added in place on first use. */
async function ensureFailureColumn(client: Client): Promise<boolean> {
  if (failureColumn !== null) return failureColumn;
  try {
    await client.execute("SELECT failures FROM push_subscriptions LIMIT 0");
    failureColumn = true;
    return true;
  } catch {
    /* a table from before anybody counted */
  }
  try {
    await client.execute("ALTER TABLE push_subscriptions ADD COLUMN failures INTEGER NOT NULL DEFAULT 0");
    failureColumn = true;
  } catch {
    // No column and no way to add one: still send, just without the counting.
    failureColumn = false;
  }
  return failureColumn;
}

/** Only for tests, which rebuild the database between cases. */
export function resetPushSchemaCache(): void {
  failureColumn = null;
  configured = false;
}

/**
 * Sends a payload to every device of a user, and says what went wrong.
 *
 * The store apps win over web push. Someone who installed the app after using
 * the site from the home screen keeps both subscriptions on the same phone,
 * and each notification arrived twice — once from the app, once from the
 * browser underneath. Web push stays the channel for whoever has no app.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  client: Client = db()
): Promise<PushOutcome> {
  const problems: string[] = [];

  // Native wrapper devices (iOS APNs, Android FCM) come first.
  let delivered = 0;
  for (const [channel, send] of [["apns", sendApnsToUser], ["fcm", sendFcmToUser]] as const) {
    try {
      delivered += await send(userId, payload, client);
    } catch (error) {
      problems.push(`${channel}:${error instanceof Error ? error.message.slice(0, 60) : "failed"}`);
    }
  }
  if (delivered > 0) return { delivered, problems };

  if (!ensureConfigured()) {
    problems.push("web:no-vapid");
    return { delivered, problems };
  }

  const counting = await ensureFailureColumn(client).catch(() => false);
  const subscriptions = await client.execute({
    sql: counting
      ? "SELECT endpoint, subscription_json, failures FROM push_subscriptions WHERE user_id = ?"
      : "SELECT endpoint, subscription_json FROM push_subscriptions WHERE user_id = ?",
    args: [userId],
  });

  for (const row of subscriptions.rows) {
    const endpoint = String(row.endpoint);
    try {
      await webpush.sendNotification(JSON.parse(String(row.subscription_json)), JSON.stringify(payload), { TTL: 3600 });
      delivered++;
      if (counting && Number(row.failures ?? 0) > 0) {
        await client
          .execute({ sql: "UPDATE push_subscriptions SET failures = 0 WHERE endpoint = ?", args: [endpoint] })
          .catch(() => {});
      }
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      problems.push(`web:${statusCode ?? "error"}`);
      if (statusCode === 404 || statusCode === 410) {
        await client.execute({ sql: "DELETE FROM push_subscriptions WHERE endpoint = ?", args: [endpoint] });
        continue;
      }
      console.error(`push delivery failed for user ${userId}:`, statusCode ?? error);
      if (!counting) continue;
      const failures = Number(row.failures ?? 0) + 1;
      if (failures >= MAX_PUSH_FAILURES) {
        await client.execute({ sql: "DELETE FROM push_subscriptions WHERE endpoint = ?", args: [endpoint] }).catch(() => {});
        problems.push("web:dropped");
      } else {
        await client
          .execute({ sql: "UPDATE push_subscriptions SET failures = ? WHERE endpoint = ?", args: [failures, endpoint] })
          .catch(() => {});
      }
    }
  }
  return { delivered, problems };
}

import webpush from "web-push";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { sendApnsToUser } from "@/lib/push/apns";
import { sendFcmToUser } from "@/lib/push/fcm";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!publicKey || !privateKey) throw new Error("VAPID keys are not configured");
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  image?: string;
  data: { url: string; nid?: string };
};

/**
 * Sends a payload to every subscription of a user. Dead subscriptions
 * (404/410 from the push service) are removed so devices can churn freely.
 * Returns the number of successful deliveries.
 *
 * The store apps win over web push. Someone who installed the app after using
 * the site from the home screen keeps both subscriptions on the same phone,
 * and each notification arrived twice — once from the app, once from the
 * browser underneath. Web push stays the channel for whoever has no app.
 */
export async function sendPushToUser(userId: string, payload: PushPayload, client: Client = db()): Promise<number> {
  ensureConfigured();

  // Native wrapper devices (iOS APNs, Android FCM) come first.
  let delivered = await sendApnsToUser(userId, payload, client).catch(() => 0);
  delivered += await sendFcmToUser(userId, payload, client).catch(() => 0);
  if (delivered > 0) return delivered;

  const subscriptions = await client.execute({
    sql: "SELECT endpoint, subscription_json FROM push_subscriptions WHERE user_id = ?",
    args: [userId],
  });
  for (const row of subscriptions.rows) {
    try {
      await webpush.sendNotification(JSON.parse(String(row.subscription_json)), JSON.stringify(payload), { TTL: 3600 });
      delivered++;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await client.execute({ sql: "DELETE FROM push_subscriptions WHERE endpoint = ?", args: [String(row.endpoint)] });
      } else {
        console.error(`push delivery failed for user ${userId}:`, statusCode ?? error);
      }
    }
  }
  return delivered;
}

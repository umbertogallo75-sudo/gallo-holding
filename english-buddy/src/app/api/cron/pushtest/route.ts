import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendApnsToUser, type ApnsTrace } from "@/lib/push/apns";
import { sendFcmToUser } from "@/lib/push/fcm";

/**
 * Sends a test notification to one user and reports what each channel
 * answered. Written because "delivered: 1" was true and the phone still
 * showed nothing: the count says an attempt was made, not that Apple or
 * Google accepted it. Guarded by the cron secret, like the scheduler.
 *
 *   curl -X POST .../api/cron/pushtest -H "Authorization: Bearer $CRON_SECRET" \
 *        -H 'Content-Type: application/json' -d '{"userId":"owner"}'
 */
export async function POST(request: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const authorization = (request.headers.get("authorization") ?? "").trim();
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = (await request.json().catch(() => ({}))) as { userId?: string };
  if (!userId) return NextResponse.json({ error: "userId mancante" }, { status: 400 });

  const payload = {
    title: "Sam · ExecLingo",
    body: "Prova di consegna — se leggi questo, le notifiche funzionano.",
    data: { url: "/home" },
  };

  const client = db();
  const apnsTrace: ApnsTrace[] = [];
  const apns = await sendApnsToUser(userId, payload, client, apnsTrace).catch((error) => {
    apnsTrace.push({ host: "-", status: 0, reason: error instanceof Error ? error.message : "throw" });
    return 0;
  });
  const fcm = await sendFcmToUser(userId, payload, client).catch(() => -1);

  return NextResponse.json({ ok: true, userId, apns, apnsTrace, fcm });
}

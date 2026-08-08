import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId, OWNER_ID } from "@/lib/auth";
import { adminResetCode } from "@/lib/auth-users";
import { db } from "@/lib/db";
import { sendPushToUser } from "@/lib/push/sender";
import { randomUUID } from "node:crypto";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("nudge"),
    userId: z.string().min(1).max(80),
    message: z.string().trim().min(1).max(200).optional(),
  }),
  z.object({
    action: z.literal("intensity"),
    userId: z.string().min(1).max(80),
    intensity: z.enum(["low", "normal", "immersive"]),
  }),
  z.object({
    action: z.literal("resetcode"),
    userId: z.string().min(1).max(80),
  }),
]);

/** Owner-only actions from the monitoring dashboard. */
export async function POST(request: Request) {
  const caller = await getUserId();
  if (caller !== OWNER_ID) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const data = parsed.data;

  if (data.action === "resetcode") {
    const temp = await adminResetCode(data.userId);
    if (!temp) return NextResponse.json({ error: "Non posso resettare questo account" }, { status: 400 });
    return NextResponse.json({ ok: true, tempCode: temp });
  }

  if (data.action === "intensity") {
    await db().execute({
      sql: "UPDATE profiles SET notification_intensity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      args: [data.intensity, data.userId],
    });
    return NextResponse.json({ ok: true });
  }

  // Nudge: one motivational push, recorded in history so the scheduler sees it.
  const question = data.message || "Your English Buddy misses you! One quick question: how was your day? Answer in English, even one line counts.";
  const notificationId = randomUUID();
  const delivered = await sendPushToUser(data.userId, {
    title: "English Buddy",
    body: question,
    data: { url: `/buddy?mode=buddy&q=${encodeURIComponent(question)}&nid=${notificationId}`, nid: notificationId },
  });
  if (delivered > 0) {
    await db().execute({
      sql: "INSERT INTO notification_history (id, user_id, kind, prompt, sent_at) VALUES (?, ?, ?, ?, ?)",
      args: [notificationId, data.userId, `nudge:manual:${new Date().toISOString().slice(0, 10)}`, question, new Date().toISOString()],
    });
  }
  return NextResponse.json({ ok: true, delivered });
}

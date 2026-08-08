import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";

const bodySchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(1000),
    keys: z.object({ p256dh: z.string().max(300), auth: z.string().max(300) }),
    expirationTime: z.number().nullable().optional(),
  }),
  timezone: z.string().max(80).optional(),
});

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const { subscription, timezone } = parsed.data;

  await db().execute({
    sql: `INSERT INTO push_subscriptions (id, user_id, endpoint, subscription_json, timezone)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET
            user_id = excluded.user_id,
            subscription_json = excluded.subscription_json,
            timezone = excluded.timezone`,
    args: [randomUUID(), userId, subscription.endpoint, JSON.stringify(subscription), timezone ?? null],
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = z.object({ endpoint: z.string().max(1000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  await db().execute({
    sql: "DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?",
    args: [parsed.data.endpoint, userId],
  });
  return NextResponse.json({ ok: true });
}

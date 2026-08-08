import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureProfile, recordDailyMetric } from "@/lib/learning/service";
import { randomUUID } from "node:crypto";

const bodySchema = z.object({ seconds: z.number().int().min(1).max(1800) });

/** Logs a finished voice conversation: minutes practiced + a session row. */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const seconds = parsed.data.seconds;
  const minutes = Math.max(1, Math.round(seconds / 60));
  await ensureProfile(userId);
  const now = new Date();
  await db().execute({
    sql: "INSERT INTO sessions (id, user_id, mode, started_at, ended_at) VALUES (?, ?, 'voice', ?, ?)",
    args: [randomUUID(), userId, new Date(now.getTime() - seconds * 1000).toISOString(), now.toISOString()],
  });
  await recordDailyMetric(userId, { minutes, interactions: 1 });
  return NextResponse.json({ ok: true, minutes });
}

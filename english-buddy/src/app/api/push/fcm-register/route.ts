import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";

const SCHEMA = `CREATE TABLE IF NOT EXISTS fcm_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  timezone TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  last_seen TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user ON fcm_tokens(user_id);`;

const bodySchema = z.object({
  token: z.string().min(20).max(400),
  timezone: z.string().max(60).optional(),
});

/** The Android app registers its FCM token here after permission is granted. */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const client = db();
  const upsert = () =>
    client.execute({
      sql: `INSERT INTO fcm_tokens (token, user_id, timezone) VALUES (?, ?, ?)
            ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, timezone = excluded.timezone, last_seen = CURRENT_TIMESTAMP`,
      args: [parsed.data.token, userId, parsed.data.timezone ?? null],
    });
  try {
    await upsert();
  } catch {
    await client.executeMultiple(SCHEMA);
    await upsert();
  }
  return NextResponse.json({ ok: true });
}

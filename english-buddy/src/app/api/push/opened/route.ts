import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";

/** Best-effort open tracking, called by the service worker on notification click. */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = z.object({ nid: z.string().max(100) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  await db().execute({
    sql: "UPDATE notification_history SET opened_at = ? WHERE id = ? AND user_id = ? AND opened_at IS NULL",
    args: [new Date().toISOString(), parsed.data.nid, userId],
  });
  return NextResponse.json({ ok: true });
}

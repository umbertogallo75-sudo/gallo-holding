import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { name, level, goal, timezone } = await request.json();
  const database = db();

  await database.batch([
    { sql: `INSERT INTO profiles (id, display_name, timezone) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name, timezone=excluded.timezone`, args: [userId, String(name || "Friend"), String(timezone || "")] },
    { sql: `INSERT INTO learning_state (user_id, cefr_level, primary_goal) VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET cefr_level=excluded.cefr_level, primary_goal=excluded.primary_goal, updated_at=CURRENT_TIMESTAMP`, args: [userId, String(level || "A2"), String(goal || "Business calls and meetings")] },
  ], "write");
  return NextResponse.json({ ok: true });
}

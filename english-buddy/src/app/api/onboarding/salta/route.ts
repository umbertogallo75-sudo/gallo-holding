import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * "No thanks" to the three questions, for somebody who registered before they
 * existed.
 *
 * It fills only what is empty and stamps onboarding_done_at, so the offer
 * never comes back. Values already chosen — by the old form, or by a coach
 * that has been calibrating for weeks — are left exactly as they are: a
 * dismissal is a refusal to answer, not a request to be reset.
 */
export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await db().execute({
    sql: `UPDATE profiles SET
            starting_level = COALESCE(starting_level, 'independent'),
            learning_goals = COALESCE(learning_goals, ?),
            path_started_at = COALESCE(path_started_at, CURRENT_TIMESTAMP),
            onboarding_done_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
    args: [JSON.stringify(["Riunioni e call"]), userId],
  });

  return NextResponse.json({ ok: true });
}

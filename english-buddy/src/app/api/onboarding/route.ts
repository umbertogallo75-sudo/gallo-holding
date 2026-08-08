import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80).default("Friend"),
  // Legacy CEFR field still accepted for backward compatibility.
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "unknown"]).optional(),
  startingLevel: z.enum(["zero", "basics", "independent", "business"]).optional(),
  goals: z.array(z.string().max(60)).max(10).default(["Business calls and meetings"]),
  professionalContext: z.string().trim().max(400).default(""),
  notificationIntensity: z.enum(["low", "normal", "immersive"]).default("immersive"),
  timezone: z.string().max(80).default(""),
});

const startingLevelToCefr: Record<string, string> = { zero: "A1", basics: "A2", independent: "B1", business: "B2" };

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { name, level, startingLevel, goals, professionalContext, notificationIntensity, timezone } = parsed.data;

  // Starting level drives the CEFR seed; legacy CEFR input still works.
  // "I don't know" starts at A2 — the diagnostic-through-use loop adjusts from there.
  const cefr = startingLevel
    ? startingLevelToCefr[startingLevel]
    : level && level !== "unknown"
      ? level
      : "A2";
  const translationSupport = startingLevel === "zero" || startingLevel === "basics" || cefr === "A1" ? 1 : 0;
  const primaryGoal = goals[0] ?? "Business calls and meetings";

  await db().batch(
    [
      {
        sql: `INSERT INTO profiles (id, display_name, timezone, professional_context, learning_goals, notification_intensity, starting_level, translation_support, path_started_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO UPDATE SET
                display_name = excluded.display_name,
                timezone = excluded.timezone,
                professional_context = excluded.professional_context,
                learning_goals = excluded.learning_goals,
                notification_intensity = excluded.notification_intensity,
                starting_level = excluded.starting_level,
                translation_support = excluded.translation_support,
                path_started_at = COALESCE(profiles.path_started_at, excluded.path_started_at),
                updated_at = CURRENT_TIMESTAMP`,
        args: [userId, name, timezone, professionalContext || null, JSON.stringify(goals), notificationIntensity, startingLevel ?? null, translationSupport],
      },
      {
        sql: `INSERT INTO learning_state (user_id, cefr_level, primary_goal)
              VALUES (?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET
                cefr_level = excluded.cefr_level,
                primary_goal = excluded.primary_goal,
                updated_at = CURRENT_TIMESTAMP`,
        args: [userId, cefr, primaryGoal],
      },
    ],
    "write"
  );

  return NextResponse.json({ ok: true });
}

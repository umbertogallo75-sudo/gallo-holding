import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { OnboardingForm } from "./OnboardingForm";

/**
 * Onboarding doubles as the settings screen ("change level, goals or
 * notifications"), so it must prefill existing values — otherwise saving
 * with an untouched name silently renames the profile to the default.
 */
export default async function OnboardingPage() {
  const userId = await requireUserId();
  const result = await db().execute({
    sql: "SELECT display_name, starting_level, professional_context, learning_goals, notification_intensity FROM profiles WHERE id = ? LIMIT 1",
    args: [userId],
  });
  const row = result.rows[0];
  let goals: string[] = [];
  try {
    goals = row?.learning_goals ? (JSON.parse(String(row.learning_goals)) as string[]) : [];
  } catch {
    goals = [];
  }

  return (
    <OnboardingForm
      initial={{
        name: row?.display_name && String(row.display_name) !== "Friend" ? String(row.display_name) : "",
        startingLevel: row?.starting_level ? String(row.starting_level) : "",
        goals,
        context: row?.professional_context ? String(row.professional_context) : "",
        intensity: row?.notification_intensity ? String(row.notification_intensity) : "immersive",
      }}
    />
  );
}

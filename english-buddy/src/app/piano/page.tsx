import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { pickFirstSession } from "@/lib/learning/first-session";
import { PlanHandoff } from "./PlanHandoff";

export const dynamic = "force-dynamic";

/**
 * The two and a half seconds between answering the three questions and being
 * in the first session.
 *
 * It exists so the answers visibly become something. Onboarding that ends by
 * dropping somebody back on a home screen teaches them that what they just
 * told the app made no difference; this says what the app understood and then
 * starts, without asking them to choose again.
 */
export default async function PianoPage() {
  const userId = await requireUserId();
  const result = await db().execute({
    sql: "SELECT display_name, starting_level, learning_goals, daily_minutes FROM profiles WHERE id = ? LIMIT 1",
    args: [userId],
  });
  const row = result.rows[0];
  if (!row) redirect("/onboarding");

  let goal: string | null = null;
  try {
    const goals = row.learning_goals ? (JSON.parse(String(row.learning_goals)) as string[]) : [];
    goal = goals[0] ?? null;
  } catch {
    goal = null;
  }
  const minutes = Number(row.daily_minutes ?? 5);
  const pick = pickFirstSession(row.starting_level ? String(row.starting_level) : null, goal, minutes);
  const name = row.display_name ? String(row.display_name) : "";

  return (
    <main className="shell planWrap">
      <section className="planCard">
        <div className="kicker">Il tuo piano</div>
        <h1 style={{ margin: "10px 0 18px" }}>
          {name && name !== "Amico" ? `${name}, ` : ""}novanta giorni.
        </h1>
        <p className="planLine">
          <strong>{minutes} minuti al giorno</strong>, su {goal ? goal.toLowerCase() : "quello che ti serve"}.
        </p>
        <p className="planLine">
          Cominciamo da: <strong>{pick.title}</strong>
        </p>
        <p className="muted" style={{ marginTop: 10 }}>{pick.why}</p>
        <div className="planBar" aria-hidden><span /></div>
        <PlanHandoff mode={pick.mode} />
      </section>
    </main>
  );
}

import { BottomNav } from "@/components/BottomNav";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { RescueClient } from "./RescueClient";
import { NotificationReminder } from "@/components/NotificationReminder";

export default async function RescuePage() {
  const userId = await requireUserId();
  const profileResult = await db().execute({
    sql: "SELECT p.starting_level, ls.cefr_level FROM profiles p LEFT JOIN learning_state ls ON ls.user_id = p.id WHERE p.id = ? LIMIT 1",
    args: [userId],
  });
  const row = profileResult.rows[0];
  const startingLevel = row?.starting_level ? String(row.starting_level) : null;
  const cefr = row?.cefr_level ? String(row.cefr_level) : "B1";
  const beginner = startingLevel === "zero" || startingLevel === "basics" || ["A1", "A2"].includes(cefr);

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">English Rescue</div><span className="chip">🆘 Now</span></div>
      <NotificationReminder />
      <section className="hero">
        <div className="kicker">I need English now</div>
        <h1>Say it right, right now.</h1>
        <p className="muted">Type what you want to say in Italian — get it in English in three registers, listen to it, and use it.</p>
        <p className="itHint">Scrivi in italiano cosa vuoi dire — in riunione, al telefono, in hotel, al ristorante — e te lo restituisco in inglese in tre versioni, con l&rsquo;audio.</p>
      </section>
      <RescueClient beginner={beginner} />
      <BottomNav active="home" />
    </main>
  );
}

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
      <div className="topbar"><div className="brand">Mi serve adesso</div><span style={{display:"flex",gap:6}}><span className="chip">🆘 Now</span><a className="chip" href="/home">← Home</a></span></div>
      <NotificationReminder />
      <section className="hero">
        <div className="kicker">Mi serve adesso</div>
        <h1>Dillo giusto, subito.</h1>
        <p className="muted">Scrivi in italiano cosa vuoi dire — in riunione, al telefono, in hotel, al ristorante — e te lo do in inglese in tre versioni, con l&rsquo;audio.</p>
      </section>
      <RescueClient beginner={beginner} />
      <BottomNav active="home" />
    </main>
  );
}

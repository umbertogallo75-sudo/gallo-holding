import { redirect } from "next/navigation";
import { AddPhrase } from "@/components/AddPhrase";
import { BottomNav } from "@/components/BottomNav";
import { PhraseRow } from "@/components/PhraseRow";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";

/** Every expression the user has learned or saved, always at hand. */
export default async function PhrasebookPage() {
  const userId = await requireUserId();
  const database = db();
  const profileResult = await database.execute({ sql: "SELECT id FROM profiles WHERE id = ? LIMIT 1", args: [userId] });
  if (!profileResult.rows.length) redirect("/onboarding");

  const result = await database.execute({
    sql: "SELECT expression, meaning, mastered FROM expressions WHERE user_id = ? ORDER BY mastered ASC, created_at DESC LIMIT 200",
    args: [userId],
  });
  const learning = result.rows.filter((r) => !Number(r.mastered));
  const mastered = result.rows.filter((r) => Number(r.mastered));

  const renderRow = (row: (typeof result.rows)[number], index: number) => (
    <PhraseRow key={index} text={String(row.expression)} meaning={row.meaning ? String(row.meaning) : null} />
  );

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">Le tue frasi</div><a className="chip" href="/home">← Home</a></div>
      <section className="hero">
        <div className="kicker">Il tuo frasario</div>
        <h1>Tutto quello che hai imparato.</h1>
        <p className="muted">Le espressioni che hai imparato e quelle che hai deciso di tenere, con l&rsquo;audio. Ripassale al volo prima di una riunione o di un viaggio — tornano da sole nei ripassi e in Palestra.</p>
        <AddPhrase />
      </section>
      <section className="card">
        <h2>In lavorazione ({learning.length})</h2>
        {learning.length ? learning.map(renderRow) : <p className="muted">Durante una conversazione, scritta o a voce, tocca <strong>☆ Ricorda</strong> sotto una frase e la ritrovi qui.</p>}
      </section>
      <section className="card">
        <h2>Padroneggiate ✓ ({mastered.length})</h2>
        {mastered.length ? mastered.map(renderRow) : <p className="muted">Dopo abbastanza ripassi riusciti, le espressioni si fissano qui.</p>}
      </section>
      <BottomNav active="progress" />
    </main>
  );
}

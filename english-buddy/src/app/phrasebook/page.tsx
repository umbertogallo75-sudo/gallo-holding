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

  // The two lists are the point: what they chose, and what Sam proposed.
  // A column that may not exist yet on an older database — the ordering
  // simply falls back to "everything is Sam's", which is how it was.
  const result = await database
    .execute({
      sql: "SELECT expression, meaning, mastered, saved_by_user FROM expressions WHERE user_id = ? ORDER BY created_at DESC LIMIT 200",
      args: [userId],
    })
    .catch(() =>
      database.execute({
        sql: "SELECT expression, meaning, mastered FROM expressions WHERE user_id = ? ORDER BY created_at DESC LIMIT 200",
        args: [userId],
      })
    );
  const mine = result.rows.filter((row) => Number(row.saved_by_user ?? 0) === 1);
  const fromSam = result.rows.filter((row) => Number(row.saved_by_user ?? 0) !== 1);

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
        <h2>Le tue ({mine.length})</h2>
        <p className="itHint" style={{ marginTop: 0 }}>
          Quelle che hai deciso tu di tenere, toccando ☆ durante una conversazione o scrivendole qui sopra. Ritocca la
          stella per toglierle.
        </p>
        {mine.length ? mine.map(renderRow) : (
          <p className="muted">
            Ancora nessuna. Durante una conversazione, scritta o a voce, tocca <strong>☆ Ricorda</strong> sotto una
            frase e la ritrovi qui.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Proposte da Sam ({fromSam.length})</h2>
        <p className="itHint" style={{ marginTop: 0 }}>
          Le espressioni che ti ha insegnato lui. Tornano nei ripassi e in Palestra: se una non ti interessa, toccala e
          sparisce.
        </p>
        {fromSam.length ? fromSam.map(renderRow) : <p className="muted">Si accumulano da sole, conversazione dopo conversazione.</p>}
      </section>

      <BottomNav active="progress" />
    </main>
  );
}

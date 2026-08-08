import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { Speak } from "@/components/Speak";
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
    <div key={index} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
      <div>
        <strong style={{ fontSize: 16 }}>{String(row.expression)}</strong>
        {row.meaning ? <div className="itHint">{String(row.meaning)}</div> : null}
      </div>
      <Speak text={String(row.expression)} compact />
    </div>
  );

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">Phrasebook</div><a className="chip" href="/progress">← Progress</a></div>
      <section className="hero">
        <div className="kicker">Your phrases</div>
        <h1>Everything you&rsquo;ve learned.</h1>
        <p className="muted">Skim it before a meeting or a trip — one minute is enough.</p>
        <p className="itHint">Il tuo frasario personale: tutte le espressioni imparate e salvate, con l&rsquo;audio. Ripassalo al volo prima di una riunione o di un viaggio.</p>
      </section>
      <section className="card">
        <h2>Learning now · In lavorazione ({learning.length})</h2>
        {learning.length ? learning.map(renderRow) : <p className="muted">Expressions you meet in conversations will collect here. <span className="itHint" style={{ display: "block" }}>Le espressioni incontrate nelle conversazioni si raccoglieranno qui.</span></p>}
      </section>
      <section className="card">
        <h2>Mastered ✓ · Padroneggiate ({mastered.length})</h2>
        {mastered.length ? mastered.map(renderRow) : <p className="muted">Reviewed enough times, expressions land here for good. <span className="itHint" style={{ display: "block" }}>Dopo abbastanza ripassi riusciti, le espressioni si fissano qui.</span></p>}
      </section>
      <BottomNav active="progress" />
    </main>
  );
}

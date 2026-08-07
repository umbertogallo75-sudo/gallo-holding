import { BottomNav } from "@/components/BottomNav";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";

const labels: Record<string,string> = { listening:"Listening", speaking:"Speaking", business_conversation:"Business conversation", vocabulary:"Vocabulary", grammar:"Grammar", pronunciation:"Pronunciation", fluency:"Fluency", comprehension:"Comprehension" };

export default async function ProgressPage() {
  const id = await requireUserId();
  const database = db();
  const [stateResult,mistakesResult,expressionsResult] = await Promise.all([
    database.execute({sql:"SELECT * FROM learning_state WHERE user_id = ? LIMIT 1",args:[id]}),
    database.execute({sql:"SELECT incorrect, correct, times_seen FROM mistakes WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT 5",args:[id]}),
    database.execute({sql:"SELECT expression FROM expressions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5",args:[id]}),
  ]);
  const state = stateResult.rows[0];
  const mistakes = mistakesResult.rows;
  const expressions = expressionsResult.rows;
  const values = Object.keys(labels).map(k => [k, Number(state?.[k] ?? 50)] as const);
  return <main className="shell"><div className="topbar"><div className="brand">Progress</div><span className="chip">CEFR {state?.cefr_level ? String(state.cefr_level) : "—"}</span></div>
    <section className="hero"><div className="kicker">Practical ability</div><h1>What is getting easier?</h1><p className="muted">Scores move gradually from real evidence in your conversations.</p></section>
    <section className="card">{values.map(([k,v]) => <div className="skillRow" key={k}><span>{labels[k]}</span><div className="bar"><span style={{width:`${v}%`}} /></div><span className="skillScore">{v}</span></div>)}</section>
    <section className="card"><h2>Recent fixes</h2>{mistakes.length ? mistakes.map((m,i)=><p key={i}><span className="muted">{String(m.incorrect)}</span> → <strong>{String(m.correct)}</strong></p>) : <p className="muted">Your corrections will appear here.</p>}</section>
    <section className="card"><h2>New expressions</h2>{expressions.length ? expressions.map((e,i)=><p key={i}><strong>{String(e.expression)}</strong></p>) : <p className="muted">Useful expressions will build automatically.</p>}</section>
    <BottomNav active="progress" />
  </main>;
}

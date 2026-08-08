import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { CAPABILITIES, monthPhase } from "@/lib/learning/capabilities";
import { NotificationReminder } from "@/components/NotificationReminder";

const labels: Record<string,string> = { listening:"Listening", speaking:"Speaking", business_conversation:"Business conversation", vocabulary:"Vocabulary", grammar:"Grammar", pronunciation:"Pronunciation", fluency:"Fluency", comprehension:"Comprehension" };

export default async function ProgressPage() {
  const id = await requireUserId();
  const database = db();
  const [stateResult,mistakesResult,expressionsResult,capsResult,profileResult] = await Promise.all([
    database.execute({sql:"SELECT * FROM learning_state WHERE user_id = ? LIMIT 1",args:[id]}),
    database.execute({sql:"SELECT incorrect, correct, times_seen FROM mistakes WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT 5",args:[id]}),
    database.execute({sql:"SELECT expression FROM expressions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5",args:[id]}),
    database.execute({sql:"SELECT capability FROM user_capabilities WHERE user_id = ?",args:[id]}),
    database.execute({sql:"SELECT path_started_at, created_at, weekly_focus FROM profiles WHERE id = ? LIMIT 1",args:[id]}),
  ]);
  const state = stateResult.rows[0];
  if (!state) redirect("/onboarding");
  const mistakes = mistakesResult.rows;
  const expressions = expressionsResult.rows;
  const achieved = new Set(capsResult.rows.map(r => String(r.capability)));
  const done = CAPABILITIES.filter(c => achieved.has(c.key));
  const next = CAPABILITIES.filter(c => !achieved.has(c.key)).slice(0, 5);
  const profileRow = profileResult.rows[0];
  const phase = monthPhase(profileRow?.path_started_at ? String(profileRow.path_started_at) : profileRow?.created_at ? String(profileRow.created_at) : null);
  const values = Object.keys(labels).map(k => [k, Number(state?.[k] ?? 50)] as const);
  return <main className="shell"><div className="topbar"><div className="brand">Progress</div><span className="chip">CEFR {state?.cefr_level ? String(state.cefr_level) : "—"} · Month {phase}/3</span></div>
    <NotificationReminder />
    <section className="hero"><div className="kicker">Practical ability</div><h1>What is getting easier?</h1><p className="muted">Scores move gradually from real evidence in your conversations.</p><p className="itHint">Mese {phase} del tuo percorso di 3 mesi verso l&rsquo;inglese professionale.</p></section>
    {profileRow?.weekly_focus ? <section className="card" style={{borderColor:"color-mix(in srgb, var(--accent) 40%, var(--line))"}}><div className="kicker">📌 This week&rsquo;s focus</div><p style={{margin:"6px 0 2px", fontWeight:700, fontSize:17}}>{String(profileRow.weekly_focus)}</p><p className="itHint">Il tuo obiettivo della settimana: il coach orienterà le conversazioni per fartelo praticare. Si aggiorna ogni 7 giorni sui tuoi errori più ricorrenti.</p></section> : null}
    <section className="card"><h2>You can now</h2>
      {done.length ? done.map(c => <p key={c.key} style={{margin:"7px 0"}}>✓ <strong>{c.en}</strong><span className="itHint" style={{display:"block",marginLeft:20}}>{c.it}</span></p>) : <p className="muted">Real-world abilities will appear here as you demonstrate them in conversation. <span className="itHint" style={{display:"block"}}>Le abilità reali appariranno qui man mano che le dimostri in conversazione.</span></p>}
      <h2 style={{marginTop:16}}>Next targets</h2>
      {next.map(c => <p key={c.key} style={{margin:"7px 0"}} className="muted">△ {c.en}<span className="itHint" style={{display:"block",marginLeft:20}}>{c.it}</span></p>)}
    </section>
    <section className="card">{values.map(([k,v]) => <div className="skillRow" key={k}><span>{labels[k]}</span><div className="bar"><span style={{width:`${v}%`}} /></div><span className="skillScore">{v}</span></div>)}</section>
    <section className="card"><h2>Recent fixes</h2>{mistakes.length ? mistakes.map((m,i)=><p key={i}><span className="muted">{String(m.incorrect)}</span> → <strong>{String(m.correct)}</strong></p>) : <p className="muted">Your corrections will appear here.</p>}</section>
    <section className="card"><h2>New expressions</h2>{expressions.length ? expressions.map((e,i)=><p key={i}><strong>{String(e.expression)}</strong></p>) : <p className="muted">Useful expressions will build automatically.</p>}<p style={{marginTop:10}}><a href="/phrasebook" className="pill" style={{textDecoration:"none"}}>📖 Full phrasebook · Vedi tutto il frasario</a></p></section>
    <p className="itHint" style={{textAlign:"center",margin:"14px 0"}}><a href="/onboarding" style={{textDecoration:"underline"}}>Cambia livello di partenza o obiettivi</a></p>
    <BottomNav active="progress" />
  </main>;
}

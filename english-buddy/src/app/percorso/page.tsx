import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { CoachVerdict } from "@/components/CoachVerdict";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { CAPABILITIES } from "@/lib/learning/capabilities";
import {
  averageMark,
  marksFrom,
  OPEN_STAGE,
  pace,
  pathPercent,
  PATH_WEEKS,
  stageProgress,
  timePercent,
  weakest,
  weekOfPath,
} from "@/lib/learning/path";
import styles from "./percorso.module.css";

export const metadata = { title: "Il tuo percorso · ExecLingo" };

const CAP_LABELS = new Map(CAPABILITIES.map((c) => [c.key as string, c.it]));

/**
 * The path, finally visible.
 *
 * Everything on this page already existed inside the coach — the capabilities,
 * the estimates, the weeks — and none of it was ever shown as a route. That is
 * why testers could not see a path: there was not one to see, only sessions
 * that happened to follow each other.
 */
export default async function PercorsoPage() {
  const userId = await requireUserId();
  const database = db();
  const [stateResult, capsResult, profileResult, mistakesResult, expressionsResult, turnsResult] = await Promise.all([
    database.execute({ sql: "SELECT * FROM learning_state WHERE user_id = ? LIMIT 1", args: [userId] }),
    database.execute({ sql: "SELECT capability FROM user_capabilities WHERE user_id = ?", args: [userId] }),
    database.execute({ sql: "SELECT path_started_at, created_at, professional_context, weekly_focus FROM profiles WHERE id = ? LIMIT 1", args: [userId] }),
    database.execute({ sql: "SELECT incorrect, correct, category FROM mistakes WHERE user_id = ? AND mastered = 0 ORDER BY times_seen DESC, last_seen_at DESC LIMIT 30", args: [userId] }).catch(() => null),
    database.execute({ sql: "SELECT expression FROM expressions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5", args: [userId] }).catch(() => null),
    // How much was actually practised: a percentage with no evidence behind it
    // is the thing that lets somebody believe they are doing fine.
    database.execute({ sql: "SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND role = 'user'", args: [userId] }).catch(() => null),
  ]);
  const profile = profileResult.rows[0];
  if (!profile) redirect("/onboarding");

  const achieved = capsResult.rows.map((row) => String(row.capability));
  const achievedSet = new Set(achieved);
  const stages = stageProgress(achieved);
  const week = weekOfPath(profile.path_started_at ? String(profile.path_started_at) : profile.created_at ? String(profile.created_at) : null);
  const percent = pathPercent(achieved);
  const onTime = timePercent(week);
  const mistakes = mistakesResult?.rows ?? [];
  const turns = Number(turnsResult?.rows[0]?.n ?? 0);
  const verdict = pace(week, percent, turns);
  const marks = marksFrom(
    stateResult.rows[0] ?? null,
    mistakes.map((row) => ({ incorrect: String(row.incorrect), correct: String(row.correct), category: String(row.category ?? "other") }))
  );
  const average = averageMark(marks);
  const toWorkOn = weakest(marks);
  const expressions = expressionsResult?.rows ?? [];
  const level = stateResult.rows[0]?.cefr_level ? String(stateResult.rows[0].cefr_level) : null;
  const current = stages.find((stage) => stage.state === "current");
  const finished = !current;

  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">Il tuo percorso</div>
        <span style={{ display: "flex", gap: 6 }}>
          {level ? <span className="chip">CEFR {level}</span> : null}
          <Link className="chip" href="/home">← Home</Link>
        </span>
      </div>

      <section className="hero">
        <div className="kicker">Settimana {week} di {PATH_WEEKS}</div>
        <h1>{finished ? "Il percorso mappato è tuo." : current?.title}</h1>
        <p className="muted">{finished ? OPEN_STAGE.goal : current?.goal}</p>
      </section>

      {/* Two bars, because they answer two different questions and hiding the
          difference is how a progress screen becomes decoration. */}
      <section className="card">
        <div className={styles.barHead}>
          <strong>Quanto hai dimostrato</strong>
          <span className={styles.barPct}>{percent}%</span>
        </div>
        <div className={styles.bar}>
          <span className={styles.barFill} style={{ width: `${percent}%` }} />
          {week <= PATH_WEEKS ? <span className={styles.barMark} style={{ left: `${onTime}%` }} aria-hidden /> : null}
        </div>
        <p className={styles.barNote}>
          {achievedSet.size} capacità su {CAPABILITIES.length} dimostrate parlando — non studiate, dimostrate.
          {week <= PATH_WEEKS ? <> Il trattino è dove sarebbe il calendario oggi.</> : null}
        </p>
        <p className={`${styles.pace} ${styles[verdict.tone]}`}>{verdict.text}</p>
      </section>

      {profile.weekly_focus ? (
        <section className="card" style={{ borderColor: "color-mix(in srgb, var(--accent) 40%, var(--line))" }}>
          <div className="kicker">📌 Il focus di questa settimana</div>
          <p style={{ margin: "6px 0 2px", fontWeight: 700, fontSize: 17 }}>{String(profile.weekly_focus)}</p>
          <p className="itHint">Si aggiorna ogni 7 giorni sui tuoi errori più ricorrenti: Sam orienta le conversazioni per fartelo praticare.</p>
        </section>
      ) : null}

      {!finished && current ? (
        <section className="card">
          <div className="kicker">Adesso tocca a questo</div>
          <p style={{ margin: "6px 0 10px", fontSize: 16.5, fontWeight: 700 }}>{current.title}</p>
          <p className="muted" style={{ marginTop: 0 }}>{current.goal}</p>
          <Link className="primary full" href={current.href} style={{ display: "block", textAlign: "center", textDecoration: "none" }} data-track="path_stage_start">
            {current.action} →
          </Link>
        </section>
      ) : null}

      <div className="sectionHead"><h2>Le tappe</h2></div>
      <ol className={styles.stages}>
        {stages.map((stage) => (
          <li key={stage.key} className={`${styles.stage} ${styles[stage.state]}`}>
            <span className={styles.dot} aria-hidden>{stage.state === "done" ? "✓" : stage.state === "current" ? "▸" : ""}</span>
            <div className={styles.stageBody}>
              <span className={styles.weeks}>Settimane {stage.weeks[0]}–{stage.weeks[1]}</span>
              <strong className={styles.stageTitle}>{stage.title}</strong>
              <span className={styles.stageGoal}>{stage.goal}</span>
              <ul className={styles.caps}>
                {stage.capabilities.map((key) => (
                  <li key={key} className={achievedSet.has(key) ? styles.capDone : styles.capTodo}>
                    {achievedSet.has(key) ? "✓" : "△"} {CAP_LABELS.get(key) ?? key}
                  </li>
                ))}
              </ul>
              {stage.state !== "done" ? (
                <Link className={styles.stageGo} href={stage.href} data-track="path_stage_start">{stage.action} →</Link>
              ) : null}
            </div>
          </li>
        ))}
        {/* The stage that never closes. A path that ends at week twelve tells
            somebody who already speaks English that there is nothing here for
            them, which is both untrue and the opposite of the point. */}
        <li className={`${styles.stage} ${styles.open}`}>
          <span className={styles.dot} aria-hidden>∞</span>
          <div className={styles.stageBody}>
            <span className={styles.weeks}>Da qui in avanti</span>
            <strong className={styles.stageTitle}>{OPEN_STAGE.title}</strong>
            <span className={styles.stageGoal}>
              {OPEN_STAGE.goal}
              {profile.professional_context ? <> Nel tuo caso: {String(profile.professional_context)}.</> : null}
            </span>
            <Link className={styles.stageGo} href={OPEN_STAGE.href} data-track="path_stage_start">{OPEN_STAGE.action} →</Link>
          </div>
        </li>
      </ol>

      <div className="sectionHead"><h2>Il pagellino</h2><span className={styles.avg}>media {average.toFixed(1)}</span></div>
      <section className="card">
        <p className="itHint" style={{ marginTop: 0 }}>
          Voti da 1 a 10, dati da Sam a ogni scambio su quello che ti sente fare davvero. Non sono voti di scuola: il 6
          qui non è una promozione, è «non basta ancora per una riunione vera».
        </p>
        <div className={styles.marks}>
          {marks.map((mark) => (
            <div key={mark.skill} className={styles.mark}>
              <div className={styles.markTop}>
                <strong>{mark.label}</strong>
                <span className={`${styles.score} ${mark.mark >= 7.5 ? styles.good : mark.mark >= 6 ? styles.ok : styles.low}`}>
                  {mark.mark.toFixed(1).replace(".0", "")}
                </span>
              </div>
              <div className={styles.bar}>
                <span className={styles.barFill} style={{ width: `${mark.mark * 10}%` }} />
              </div>
              <span className={styles.markMeaning}>{mark.meaning}</span>
              {/* Why this number and not another one: their own sentences.
                  "Mi dai 5 sulla grammatica senza spiegarmi davvero perché." */}
              {mark.evidence.length ? (
                <ul className={styles.markWhy}>
                  {mark.evidence.map((line) => <li key={line}>{line}</li>)}
                </ul>
              ) : null}
              <Link className={styles.markAdvice} href={mark.href}>{mark.advice}</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="kicker">Dove conviene andare adesso</div>
        {toWorkOn.map((mark) => (
          <p key={mark.skill} style={{ margin: "8px 0" }}>
            <strong>{mark.label}</strong> <span className="muted">({mark.mark.toFixed(1).replace(".0", "")})</span> —{" "}
            <Link href={mark.href}>{mark.advice}</Link>
          </p>
        ))}
      </section>

      <CoachVerdict />

      {/* What used to live on a second page with a second set of numbers.
          Two screens measuring the same thing on two different scales is how
          somebody ends up not trusting either. */}
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Le tue correzioni recenti</h2>
        {mistakes.length ? (
          mistakes.slice(0, 5).map((row, i) => (
            <p key={i} style={{ margin: "7px 0" }}>
              <span className="muted">{String(row.incorrect)}</span> → <strong>{String(row.correct)}</strong>
            </p>
          ))
        ) : (
          <p className="muted" style={{ margin: 0 }}>Nessuna ancora. Compaiono da sole quando parli.</p>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Espressioni nuove</h2>
        {expressions.length ? (
          expressions.map((row, i) => <p key={i} style={{ margin: "7px 0" }}><strong>{String(row.expression)}</strong></p>)
        ) : (
          <p className="muted" style={{ margin: 0 }}>Le espressioni utili si accumulano da sole, conversazione dopo conversazione.</p>
        )}
        <p style={{ marginTop: 10 }}>
          <Link href="/phrasebook" className="pill" style={{ textDecoration: "none" }}>★ Vedi tutto il frasario</Link>
        </p>
      </section>

      <p className="itHint" style={{ textAlign: "center", margin: "16px 0 4px" }}>
        Le tappe non si superano con il tempo: si superano parlando. Sam le segna solo quando te le vede fare davvero —
        non si regalano.
      </p>

      <p className="composerNote" style={{ textAlign: "center", margin: "14px 0" }}>
        <Link href="/onboarding" style={{ textDecoration: "underline" }}>Cambia livello di partenza o obiettivi</Link>
      </p>

      <BottomNav active="progress" />
    </main>
  );
}

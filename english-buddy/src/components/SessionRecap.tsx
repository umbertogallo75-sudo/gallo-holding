"use client";

import Link from "next/link";
import type { SessionFacts, SessionScore } from "@/lib/learning/session-score";
import styles from "./session-recap.module.css";

/**
 * The end of a session, which until now did not exist.
 *
 * A conversation that never finishes never gives anything back: no moment to
 * say what was learned, nothing to feel pleased about, nothing to compare
 * against tomorrow. Testers asked for both halves of this — a session that can
 * end, and an ending worth having.
 */
export function SessionRecap({
  score,
  facts,
  onContinue,
  onNew,
}: {
  score: SessionScore;
  facts: SessionFacts;
  /** Only offered when the session is still open: a wrap-up is not a wall. */
  onContinue?: () => void;
  onNew: () => void;
}) {
  return (
    <section className={styles.root}>
      <p className={styles.kicker}>Sessione conclusa</p>
      <div className={styles.points}>{score.points}<span>/100</span></div>
      <div className={styles.stars} aria-label={`${score.stars} stelle su 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={n <= score.stars ? styles.on : styles.off} aria-hidden>★</span>
        ))}
      </div>
      <h2 className={styles.headline}>{score.headline}</h2>
      <p className={styles.detail}>{score.detail}</p>

      <div className={styles.facts}>
        <div><strong>{facts.exchanges}</strong><span>{facts.exchanges === 1 ? "scambio" : "scambi"}</span></div>
        <div><strong>{facts.minutes}</strong><span>minuti</span></div>
        <div><strong>{facts.learned}</strong><span>{facts.learned === 1 ? "espressione" : "espressioni"}</span></div>
        <div><strong>{facts.corrected}</strong><span>{facts.corrected === 1 ? "correzione" : "correzioni"}</span></div>
      </div>

      <div className={styles.actions}>
        {onContinue ? (
          <button type="button" className="secondary full" onClick={onContinue}>Continua ancora un po&rsquo;</button>
        ) : null}
        <button type="button" className="primary full" onClick={onNew}>Nuova sessione</button>
        <Link href="/sessioni" className={styles.link}>Le tue sessioni passate →</Link>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { track } from "@/lib/track-client";
import { COMPARISON, ENGINE_CARDS, ENGINE_KEY, VOICE_ENGINES, type VoiceEngine } from "@/lib/voice/engines";
import styles from "./engine.module.css";

/**
 * How a call starts: two buttons, one per engine.
 *
 * It used to be a setting you opened, chose in, closed, and only then pressed
 * start — three taps to do one thing, and a choice made in the abstract before
 * you knew what either option sounded like. Two buttons put the choice where
 * the decision actually is, and make going back after a bad call one tap
 * rather than a hunt through a panel.
 *
 * The colours are not decoration: the same green as everywhere else means the
 * familiar one, and the blue marks the one that is new.
 */
export function EngineStart({
  onStart,
  again,
}: {
  onStart: (engine: VoiceEngine) => void;
  /** After a call: the label changes, the choice does not. */
  again?: boolean;
}) {
  const [open, setOpen] = useState(false);

  function begin(engine: VoiceEngine) {
    try {
      window.localStorage.setItem(ENGINE_KEY, engine);
    } catch {
      /* private browsing: only this call remembers */
    }
    track("voice_engine_chosen", { where: engine });
    onStart(engine);
  }

  return (
    <div className={styles.root}>
      <div className={styles.buttons}>
        {VOICE_ENGINES.map((engine) => {
          const card = ENGINE_CARDS[engine];
          return (
            <button
              key={engine}
              type="button"
              className={`${styles.start} ${engine === "live" ? styles.advanced : styles.classic}`}
              onClick={() => begin(engine)}
            >
              <span className={styles.startTop}>🎙️ {again ? "Parla ancora" : "Inizia a parlare"}</span>
              <span className={styles.startMode}>modalità {card.name.toLowerCase()}</span>
              <span className={styles.startWhy}>{card.summary}</span>
            </button>
          );
        })}
      </div>

      <button type="button" className={styles.more} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {open ? "Nascondi il confronto" : "Qual è la differenza?"}
      </button>

      {open ? (
        <div className={styles.panel}>
          <p className={styles.intro}>
            Sam può conversare in due modi. Quella avanzata è appena uscita: ascolta mentre parla, come al telefono.
            Provala e tieni quella con cui ti trovi meglio — si cambia a ogni chiamata, senza impostazioni.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col"><span className="visually-hidden">Caratteristica</span></th>
                  <th scope="col" className={styles.headClassic}>{ENGINE_CARDS.realtime.name}</th>
                  <th scope="col" className={styles.headAdvanced}>{ENGINE_CARDS.live.name}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td>{row.realtime}</td>
                    <td>{row.live}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState, useSyncExternalStore } from "react";
import { track } from "@/lib/track-client";
import {
  COMPARISON,
  DEFAULT_ENGINE,
  ENGINE_CARDS,
  ENGINE_KEY,
  isVoiceEngine,
  VOICE_ENGINES,
  type VoiceEngine,
} from "@/lib/voice/engines";
import styles from "./engine.module.css";

/**
 * Which conversation engine to talk to, chosen by the person who has to talk.
 *
 * Whether a conversation feels natural is not measurable from a server, so the
 * new full-duplex engine is offered rather than imposed: the difference is
 * laid out, including the part that is a drawback, and the classic engine
 * stays selected until somebody decides otherwise.
 */
const listeners = new Set<() => void>();
let cached: VoiceEngine | null = null;

function snapshot(): VoiceEngine {
  if (cached === null) {
    try {
      const saved = window.localStorage.getItem(ENGINE_KEY);
      cached = isVoiceEngine(saved) ? saved : DEFAULT_ENGINE;
    } catch {
      cached = DEFAULT_ENGINE;
    }
  }
  return cached;
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function choose(engine: VoiceEngine): void {
  cached = engine;
  try {
    window.localStorage.setItem(ENGINE_KEY, engine);
  } catch {
    /* private browsing: the choice holds for this visit */
  }
  for (const listener of listeners) listener();
}

export function EnginePicker() {
  const engine = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_ENGINE);
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.summary}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>Modalità di dialogo: <strong>{ENGINE_CARDS[engine].name}</strong></span>
        <span className={styles.chev} aria-hidden>{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div className={styles.panel}>
          <p className={styles.intro}>
            Sam può conversare in due modi. Il secondo è appena uscito: ascolta mentre parla, come al telefono.
            Provalo e tieni quello che ti trovi meglio — si cambia quando vuoi, anche fra una chiamata e l&rsquo;altra.
          </p>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col"><span className="visually-hidden">Caratteristica</span></th>
                  <th scope="col">{ENGINE_CARDS.realtime.name}</th>
                  <th scope="col">{ENGINE_CARDS.live.name}</th>
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

          <div className={styles.choices}>
            {VOICE_ENGINES.map((key) => {
              const card = ENGINE_CARDS[key];
              const active = engine === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={active ? `${styles.choice} ${styles.active}` : styles.choice}
                  aria-pressed={active}
                  onClick={() => {
                    choose(key);
                    track("voice_engine_chosen", { where: key });
                    setOpen(false);
                  }}
                >
                  <span className={styles.choiceName}>{card.name}{active ? " · in uso" : ""}</span>
                  <span className={styles.choiceWhy}>{card.summary}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

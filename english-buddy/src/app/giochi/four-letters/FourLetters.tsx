"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { track } from "@/lib/track-client";
import {
  BONUS_SECONDS,
  dealTray,
  drainRate,
  isAnswer,
  LETTERS,
  meaningOf,
  reshuffle,
  SKIP_PENALTY_SECONDS,
  START_SECONDS,
  trayKey,
  verdict,
  type Made,
  type Tray,
} from "@/lib/games/four-letters";
import styles from "../games.module.css";

type Phase = "ready" | "playing" | "over";

const BEST_KEY = "execlingo:four-letters:best";
const TICK_MS = 100;

/** The personal best is an external store, not React state. */
const listeners = new Set<() => void>();
let cache: number | null = null;

function bestSnapshot(): number {
  if (cache === null) {
    try {
      cache = Number(window.localStorage.getItem(BEST_KEY) ?? 0) || 0;
    } catch {
      cache = 0;
    }
  }
  return cache;
}
function subscribeBest(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function saveBest(value: number): void {
  if (value <= bestSnapshot()) return;
  cache = value;
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Private browsing: the record simply is not remembered.
  }
  for (const listener of listeners) listener();
}

export function FourLetters({ opening }: { opening: Tray }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [tray, setTray] = useState<Tray>(opening);
  const [picked, setPicked] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [made, setMade] = useState<Made[]>([]);
  const [left, setLeft] = useState(START_SECONDS);
  const [shake, setShake] = useState(0);
  const best = useSyncExternalStore(subscribeBest, bestSnapshot, () => 0);
  const seen = useRef<Set<string>>(new Set());
  const posted = useRef(false);

  const nextTray = useCallback((atScore: number) => {
    setTray((current) => {
      seen.current.add(trayKey(current));
      return dealTray(atScore, Math.random, seen.current);
    });
    setPicked([]);
  }, []);

  // The clock. One countdown for the whole game, running faster the longer it
  // has been going — this is the difficulty curve, and it is what ends a run.
  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => {
      setLeft((value) => {
        const next = value - (TICK_MS / 1000) * drainRate(score);
        if (next <= 0) {
          window.clearInterval(timer);
          setPhase("over");
          return 0;
        }
        return next;
      });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [phase, score]);

  useEffect(() => {
    if (phase !== "over" || posted.current) return;
    posted.current = true;
    saveBest(score);
    void fetch("/api/giochi/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: "four-letters", score, correct: score, total: score, items: [] }),
    }).catch(() => {
      // The run is over either way.
    });
  }, [phase, score]);

  function tapKey(position: number) {
    if (phase !== "playing" || picked.includes(position)) return;
    const next = [...picked, position];
    setPicked(next);
    if (next.length < LETTERS) return;

    const attempt = next.map((i) => tray.letters[i]).join("");
    if (isAnswer(tray, attempt)) {
      const now = score + 1;
      setScore(now);
      setMade((all) => [...all, { word: attempt, it: meaningOf(attempt) ?? "" }]);
      setLeft((value) => Math.min(value + BONUS_SECONDS, START_SECONDS));
      nextTray(now);
    } else {
      // No penalty beyond the seconds it cost: the clock is punishment enough.
      setShake((n) => n + 1);
      setPicked([]);
    }
  }

  function start() {
    posted.current = false;
    seen.current = new Set();
    setPhase("playing");
    setScore(0);
    setMade([]);
    setPicked([]);
    setLeft(START_SECONDS);
    setTray(dealTray(0, Math.random, new Set()));
    track("game_started", { where: "four-letters" });
  }

  if (phase === "ready") {
    return (
      <div className={styles.over}>
        <h2>Quattro lettere</h2>
        <p>
          Quattro lettere, una parola vera. Vale qualsiasi parola inglese che quelle lettere compongono — spesso ce n&rsquo;è più d&rsquo;una.
          Ogni parola ti ridà qualche secondo, ma l&rsquo;orologio accelera man mano che vai avanti. Alla fine ritrovi tutte le parole fatte, con il loro significato.
        </p>
        <button type="button" className={styles.go} onClick={start}>Inizia →</button>
        <p className={styles.footnote} style={{ textAlign: "center" }}>
          {START_SECONDS} secondi di partenza · +{BONUS_SECONDS}s a parola{best > 0 ? ` · record ${best}` : ""}
        </p>
      </div>
    );
  }

  if (phase === "over") {
    return (
      <div className={styles.over}>
        <h2>Tempo scaduto</h2>
        <div className={styles.finalScore}>{score}</div>
        <p>{score === 1 ? "una parola" : `${score} parole`}. {verdict(score)}</p>
        {made.length > 0 ? (
          <>
            <p className={styles.footnote} style={{ textAlign: "left" }}>Le parole che hai fatto:</p>
            <ul className={styles.review}>
              {made.map((entry, i) => (
                <li key={`${entry.word}-${i}`}>
                  <b className={styles.ok}>{entry.word}</b>
                  <em>{entry.it}</em>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <button type="button" className={styles.go} onClick={start}>Ancora →</button>
        <Link href="/giochi" className={styles.link}>Torna ai giochi</Link>
        {best > 0 ? <p className={styles.footnote} style={{ textAlign: "center" }}>Record personale: {best}</p> : null}
      </div>
    );
  }

  const seconds = Math.ceil(left);
  const low = seconds <= 10;

  return (
    <div className={styles.game}>
      <div className={styles.hud}>
        <div className={styles.hudCell}><strong>{score}</strong><span>parole</span></div>
        <div className={`${styles.hudCell} ${low ? styles.low : ""}`}><strong>{seconds}</strong><span>secondi</span></div>
        <div className={styles.hudCell}><strong>{best}</strong><span>record</span></div>
      </div>
      <div className={styles.clock} data-low={low} aria-hidden>
        <i className={styles.live} style={{ width: `${Math.max(0, (left / START_SECONDS) * 100)}%` }} />
      </div>

      <div className={`${styles.prompt} ${shake ? styles.nudge : ""}`} key={shake}>
        <p className={styles.hint}>Componi una parola con tutte e quattro le lettere</p>
        <div className={styles.slots} aria-live="polite">
          {Array.from({ length: LETTERS }, (_, i) => {
            const position = picked[i];
            const letter = position === undefined ? "" : tray.letters[position];
            return (
              <span key={i} className={letter ? `${styles.slot} ${styles.slotFilled}` : styles.slot}>{letter}</span>
            );
          })}
        </div>
      </div>

      <div className={styles.tray}>
        {tray.letters.map((letter, position) => (
          <button
            key={position}
            type="button"
            className={styles.key}
            disabled={picked.includes(position)}
            onClick={() => tapKey(position)}
            aria-label={`lettera ${letter}`}
          >
            {letter}
          </button>
        ))}
      </div>

      <div className={styles.controls}>
        <button type="button" className={styles.ghost} onClick={() => setPicked(picked.slice(0, -1))} disabled={picked.length === 0}>
          ← Cancella
        </button>
        <button type="button" className={styles.ghost} onClick={() => { setTray(reshuffle(tray, Math.random)); setPicked([]); }}>
          ⇄ Mescola
        </button>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => { setLeft((value) => Math.max(0.1, value - SKIP_PENALTY_SECONDS)); nextTray(score); }}
        >
          Salta −{SKIP_PENALTY_SECONDS}s
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
import * as sound from "@/lib/games/sound";
import { slotPxFor } from "@/lib/games/wheel-layout";
import { Wheel } from "./Wheel";
import styles from "../games.module.css";
import wheel from "../wheel.module.css";

type Phase = "ready" | "playing" | "over";
type Flash = "idle" | "right" | "wrong";

const BEST_KEY = "execlingo:four-letters:best";
const TICK_MS = 100;
/** Seconds left below which the run is visibly and audibly in trouble. */
const LOW_AT = 10;

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
    /* private browsing */
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
  const [flash, setFlash] = useState<Flash>("idle");
  const [note, setNote] = useState("");
  const [muted, setMutedState] = useState(false);
  const best = useSyncExternalStore(subscribeBest, bestSnapshot, () => 0);
  const seen = useRef<Set<string>>(new Set());
  const posted = useRef(false);
  const lastTick = useRef(0);
  /**
   * The letters chosen so far, kept alongside the state rather than inside it.
   * A tap picks a letter and submits in the same breath, before React has
   * re-rendered, so the submit has to read something that is already up to
   * date — and scoring must never live inside a state updater, which React is
   * free to run twice.
   */
  const pickedRef = useRef<number[]>([]);

  // The clock: one countdown for the whole run, spending faster the longer it
  // lasts. It also drives the ticking, which is why the two never disagree.
  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => {
      setLeft((value) => {
        const next = value - (TICK_MS / 1000) * drainRate(score);
        if (next <= 0) {
          window.clearInterval(timer);
          sound.timeUp();
          setPhase("over");
          return 0;
        }
        // One tick per beat, and the beat quickens as the clock runs down.
        const urgency = 1 - Math.min(next / START_SECONDS, 1);
        const beat = next <= LOW_AT ? 0.35 : 1 - urgency * 0.45;
        if (lastTick.current - next >= beat || lastTick.current === 0) {
          lastTick.current = next;
          sound.tick(next <= LOW_AT ? 1 : urgency);
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
    void fetch("/api/palestra/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: "four-letters", score, correct: score, total: score, items: [] }),
    }).catch(() => {
      /* the run is over either way */
    });
  }, [phase, score]);

  // Audio belongs to the page, not to the app: leaving must silence it.
  useEffect(() => () => sound.releaseSound(), []);

  function clearPicked() {
    pickedRef.current = [];
    setPicked([]);
  }

  function pick(seat: number) {
    if (phase !== "playing" || flash !== "idle") return;
    const current = pickedRef.current;
    if (current.includes(seat) || current.length >= LETTERS) return;
    sound.letterTap(current.length);
    pickedRef.current = [...current, seat];
    setPicked(pickedRef.current);
  }

  function submit() {
    if (phase !== "playing" || flash !== "idle") return;
    const current = pickedRef.current;
    if (current.length < LETTERS) return;

    const attempt = current.map((i) => tray.letters[i]).join("");
    if (isAnswer(tray, attempt)) {
      const now = score + 1;
      sound.correct();
      setScore(now);
      setMade((all) => [...all, { word: attempt, it: meaningOf(attempt) ?? "" }]);
      setLeft((value) => Math.min(value + BONUS_SECONDS, START_SECONDS));
      setNote(`${attempt.toUpperCase()} · ${meaningOf(attempt) ?? ""} · +${BONUS_SECONDS}s`);
      setFlash("right");
      window.setTimeout(() => {
        setTray((currentTray) => {
          seen.current.add(trayKey(currentTray));
          return dealTray(now, Math.random, seen.current);
        });
        clearPicked();
        setFlash("idle");
        setNote("");
      }, 520);
    } else {
      // No points lost: the seconds it cost are the whole penalty.
      sound.wrong();
      setFlash("wrong");
      setNote("Non è una parola. Riprova.");
      window.setTimeout(() => {
        clearPicked();
        setFlash("idle");
        setNote("");
      }, 420);
    }
  }

  function start() {
    sound.armSound();
    const startMuted = sound.readMuted();
    sound.setMuted(startMuted);
    setMutedState(startMuted);
    posted.current = false;
    seen.current = new Set();
    lastTick.current = 0;
    setPhase("playing");
    setScore(0);
    setMade([]);
    clearPicked();
    setNote("");
    setFlash("idle");
    setLeft(START_SECONDS);
    setTray(dealTray(0, Math.random, new Set()));
    track("game_started", { where: "four-letters" });
  }

  function toggleMute() {
    const next = !muted;
    sound.setMuted(next);
    setMutedState(next);
  }

  if (phase === "ready") {
    return (
      <div className={styles.over}>
        <h2>Quattro lettere</h2>
        <p>
          Quattro lettere, una parola vera. Trascina il dito da una lettera all&rsquo;altra, o toccale una per una.
          Vale qualsiasi parola inglese che quelle lettere compongono — spesso ce n&rsquo;è più d&rsquo;una.
          Ogni parola ti ridà {BONUS_SECONDS} secondi, ma l&rsquo;orologio accelera. Alla fine ritrovi tutte le parole fatte, tradotte.
        </p>
        <button type="button" className={styles.go} onClick={start}>Inizia →</button>
        <p className={styles.footnote} style={{ textAlign: "center" }}>
          {START_SECONDS} secondi di partenza{best > 0 ? ` · record ${best}` : ""} · con audio
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
        <Link href="/palestra" className={styles.link}>Torna alla palestra</Link>
        {best > 0 ? <p className={styles.footnote} style={{ textAlign: "center" }}>Record personale: {best}</p> : null}
      </div>
    );
  }

  const seconds = Math.ceil(left);
  const low = seconds <= LOW_AT;

  return (
    <div className={styles.game}>
      <div className={styles.hud}>
        <div className={styles.hudCell}><strong>{score}</strong><span>parole</span></div>
        <div className={`${styles.hudCell} ${low ? styles.low : ""}`}><strong>{seconds}</strong><span>secondi</span></div>
        <div className={styles.hudCell}><strong>{best}</strong><span>record</span></div>
      </div>

      <div className={wheel.stage} data-state={flash} style={{ ["--slot-size" as string]: `${slotPxFor(LETTERS)}px` }}>
        <div className={wheel.slots}>
          {Array.from({ length: LETTERS }, (_, i) => {
            const seat = picked[i];
            const letter = seat === undefined ? "" : tray.letters[seat];
            return (
              <span key={i} className={letter ? `${wheel.slot} ${wheel.slotFull}` : wheel.slot}>{letter}</span>
            );
          })}
        </div>

        <Wheel
          letters={tray.letters}
          picked={picked}
          remaining={left / START_SECONDS}
          low={low}
          state={flash}
          onPick={pick}
          onSubmit={submit}
          onClear={clearPicked}
        />

        <p className={wheel.word} aria-live="polite">{note}</p>
      </div>

      <div className={styles.controls}>
        <button type="button" className={styles.ghost} onClick={clearPicked} disabled={picked.length === 0}>
          ← Cancella
        </button>
        <button type="button" className={styles.ghost} onClick={() => { setTray(reshuffle(tray, Math.random)); clearPicked(); }}>
          ⇄ Mescola
        </button>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => {
            setLeft((value) => Math.max(0.1, value - SKIP_PENALTY_SECONDS));
            setTray((current) => { seen.current.add(trayKey(current)); return dealTray(score, Math.random, seen.current); });
            clearPicked();
          }}
        >
          Salta −{SKIP_PENALTY_SECONDS}s
        </button>
        <button type="button" className={styles.ghost} onClick={toggleMute} aria-pressed={muted}>
          {muted ? "🔇 Audio" : "🔊 Audio"}
        </button>
      </div>
    </div>
  );
}

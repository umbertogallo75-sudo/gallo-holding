"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { track } from "@/lib/track-client";
import {
  coverage,
  dealTray,
  FULL_SECONDS,
  judge,
  MIN_WORD,
  reshuffle,
  SKIP_SECONDS,
  START_SECONDS,
  verdict,
  WORD_SECONDS,
  type Found,
  type Tray,
} from "@/lib/games/long-word";
import * as sound from "@/lib/games/sound";
import { hush, say } from "@/lib/games/speak";
import { Wheel } from "../four-letters/Wheel";
import styles from "../games.module.css";
import wheel from "../wheel.module.css";

type Phase = "ready" | "playing" | "over";
const BEST_KEY = "execlingo:parola-lunga:best";
const TICK_MS = 200;
const LOW_AT = 15;

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

export function LongWord({ opening }: { opening: Tray }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [tray, setTray] = useState<Tray>(opening);
  const [picked, setPicked] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(START_SECONDS);
  const [found, setFound] = useState<Found[]>([]);
  const [note, setNote] = useState("");
  const [flash, setFlash] = useState<"idle" | "right" | "wrong">("idle");
  const [missedLast, setMissedLast] = useState<Tray | null>(null);
  const best = useSyncExternalStore(subscribeBest, bestSnapshot, () => 0);
  const seen = useRef<Set<string>>(new Set());
  const posted = useRef(false);
  const pickedRef = useRef<number[]>([]);
  /**
   * Words found on the current tray, which cannot be scored twice. Held in
   * both places on purpose: the counter reads it while rendering, and judge()
   * reads it in the same breath as the tap that changed it.
   */
  const [foundHere, setFoundHere] = useState<string[]>([]);
  const onThisTray = useRef<string[]>([]);

  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => {
      setLeft((value) => {
        const next = value - TICK_MS / 1000;
        if (next <= 0) {
          window.clearInterval(timer);
          sound.timeUp();
          setPhase("over");
          return 0;
        }
        return next;
      });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "over" || posted.current) return;
    posted.current = true;
    saveBest(score);
    void fetch("/api/palestra/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: "parola-lunga", score, correct: found.length, total: found.length, items: [] }),
    }).catch(() => undefined);
  }, [phase, score, found.length]);

  useEffect(
    () => () => {
      sound.releaseSound();
      hush();
    },
    []
  );

  function clearPicked() {
    pickedRef.current = [];
    setPicked([]);
  }

  function pick(seat: number) {
    if (phase !== "playing" || flash !== "idle") return;
    const current = pickedRef.current;
    if (current.includes(seat) || current.length >= tray.letters.length) return;
    sound.letterTap(current.length);
    pickedRef.current = [...current, seat];
    setPicked(pickedRef.current);
  }

  function nextTray(bonus: number) {
    seen.current.add(tray.full);
    onThisTray.current = [];
    setFoundHere([]);
    setTray(dealTray(Math.random, seen.current));
    clearPicked();
    setLeft((value) => Math.min(value + bonus, START_SECONDS * 1.5));
  }

  function submit() {
    if (phase !== "playing" || flash !== "idle") return;
    const attempt = pickedRef.current.map((i) => tray.letters[i]).join("");
    if (attempt.length === 0) return;

    const result = judge(tray, attempt, onThisTray.current);
    if (!result.ok) {
      sound.wrong();
      setFlash("wrong");
      setNote(
        result.reason === "too_short"
          ? `Almeno ${MIN_WORD} lettere.`
          : result.reason === "already_found"
            ? "Questa l'hai già trovata."
            : "Non è una parola."
      );
      window.setTimeout(() => {
        clearPicked();
        setFlash("idle");
        setNote("");
      }, 620);
      return;
    }

    onThisTray.current = [...onThisTray.current, result.word];
    setFoundHere(onThisTray.current);
    setFound((all) => [...all, { word: result.word, it: result.it, points: result.points, full: result.full }]);
    setScore((value) => value + result.points);
    sound.correct();
    if (result.full) sound.bonus();
    say(result.word, 0.95);
    setFlash("right");
    setNote(
      result.full
        ? `${result.word.toUpperCase()} — tutte le lettere! +${result.points} · +${FULL_SECONDS}s`
        : `${result.word.toUpperCase()} · ${result.it} · +${result.points}`
    );
    window.setTimeout(() => {
      setFlash("idle");
      setNote("");
      if (result.full) nextTray(FULL_SECONDS);
      else {
        clearPicked();
        setLeft((value) => Math.min(value + WORD_SECONDS, START_SECONDS * 1.5));
      }
    }, result.full ? 1400 : 780);
  }

  function start() {
    sound.armSound();
    sound.setMuted(sound.readMuted());
    posted.current = false;
    seen.current = new Set();
    onThisTray.current = [];
    setFoundHere([]);
    setPhase("playing");
    setScore(0);
    setFound([]);
    setNote("");
    setFlash("idle");
    setMissedLast(null);
    setLeft(START_SECONDS);
    setTray(dealTray(Math.random, new Set()));
    clearPicked();
    track("game_started", { where: "parola-lunga" });
  }

  if (phase === "ready") {
    return (
      <div className={styles.over}>
        <h2>Parola lunga</h2>
        <p>
          Sette, otto o nove lettere, e dentro ci sono molte parole. Ogni parola da {MIN_WORD} lettere in su vale punti
          e ti ridà {WORD_SECONDS} secondi — più è lunga, più vale. Quella che usa <strong>tutte</strong> le lettere
          vale il doppio, ti dà {FULL_SECONDS} secondi e apre il gruppo successivo.
        </p>
        <p className={styles.footnote} style={{ textAlign: "left" }}>
          Trascina il dito sulle lettere o toccale una a una, poi conferma. Le lettere sono sempre quelle di una parola
          vera: una risposta lunga c&rsquo;è sempre.
        </p>
        <button type="button" className={styles.go} onClick={start}>Inizia →</button>
        <p className={styles.footnote} style={{ textAlign: "center" }}>
          {START_SECONDS} secondi di partenza{best > 0 ? ` · record ${best}` : ""} · con audio
        </p>
      </div>
    );
  }

  if (phase === "over") {
    const fulls = found.filter((f) => f.full).length;
    const missed = missedLast ?? tray;
    const stillThere = missed.findable.filter((entry) => !found.some((f) => f.word === entry.word)).slice(0, 8);
    return (
      <div className={styles.over}>
        <h2>Tempo scaduto</h2>
        <div className={styles.finalScore}>{score}</div>
        <p>{found.length === 1 ? "una parola" : `${found.length} parole`}. {verdict(score, fulls)}</p>
        {found.length > 0 ? (
          <ul className={styles.review}>
            {found.map((entry, i) => (
              <li key={`${entry.word}-${i}`}>
                <b className={styles.ok}>{entry.full ? "★ " : ""}{entry.word}</b>
                <em>{entry.it} · {entry.points}</em>
              </li>
            ))}
          </ul>
        ) : null}
        {stillThere.length > 0 ? (
          <>
            <p className={styles.footnote} style={{ textAlign: "left" }}>
              Nell&rsquo;ultimo gruppo c&rsquo;erano anche:
            </p>
            <ul className={styles.review}>
              {stillThere.map((entry) => (
                <li key={entry.word}>
                  <b className={styles.ko}>{entry.word}</b>
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
  const got = coverage(tray, foundHere);

  return (
    <div className={styles.game}>
      <div className={styles.hud}>
        <div className={styles.hudCell}><strong>{score}</strong><span>punti</span></div>
        <div className={`${styles.hudCell} ${low ? styles.low : ""}`}><strong>{seconds}</strong><span>secondi</span></div>
        <div className={styles.hudCell}><strong>{got.got}/{got.outOf}</strong><span>trovate qui</span></div>
      </div>

      <div className={wheel.stage} data-state={flash} style={{ ["--slot-size" as string]: "46px" }}>
        <div className={wheel.slots}>
          {Array.from({ length: tray.letters.length }, (_, i) => {
            const seat = picked[i];
            const letter = seat === undefined ? "" : tray.letters[seat];
            return <span key={i} className={letter ? `${wheel.slot} ${wheel.slotFull}` : wheel.slot}>{letter}</span>;
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
          submitOnTap={false}
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
          onClick={() => { setMissedLast(tray); setLeft((v) => Math.max(0.1, v - SKIP_SECONDS)); nextTray(0); }}
        >
          Cambia −{SKIP_SECONDS}s
        </button>
      </div>

      <button type="button" className={styles.go} onClick={submit} disabled={picked.length < MIN_WORD}>
        {picked.length < MIN_WORD ? `Almeno ${MIN_WORD} lettere` : `Conferma «${picked.map((i) => tray.letters[i]).join("")}»`}
      </button>
    </div>
  );
}

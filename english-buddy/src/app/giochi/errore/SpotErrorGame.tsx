"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { track } from "@/lib/track-client";
import { BONUS_SECONDS, buildRun, RUN_SECONDS, verdict, type Puzzle } from "@/lib/games/spot-error";
import * as sound from "@/lib/games/sound";
import { hush, say } from "@/lib/games/speak";
import styles from "../games.module.css";
import quiz from "../quiz.module.css";

type Phase = "ready" | "playing" | "over";
const BEST_KEY = "execlingo:errore:best";
const TICK_MS = 200;

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

export function SpotErrorGame({ opening, own }: { opening: Puzzle[]; own: Puzzle[] }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [run, setRun] = useState<Puzzle[]>(opening);
  const [index, setIndex] = useState(0);
  const [tapped, setTapped] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [left, setLeft] = useState(RUN_SECONDS);
  const [results, setResults] = useState<{ puzzle: Puzzle; ok: boolean }[]>([]);
  const best = useSyncExternalStore(subscribeBest, bestSnapshot, () => 0);
  const posted = useRef(false);
  const serverRun = useRef(true);

  const puzzle = run[index];
  const ownCount = own.length;

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
    saveBest(correct);
    void fetch("/api/giochi/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: "errore",
        score: correct,
        correct,
        total: results.length,
        items: results
          .filter((r) => r.puzzle.itemText)
          .map((r) => ({ itemText: r.puzzle.itemText as string, success: r.ok })),
      }),
    }).catch(() => undefined);
  }, [phase, correct, results]);

  useEffect(
    () => () => {
      sound.releaseSound();
      hush();
    },
    []
  );

  function tap(position: number) {
    if (phase !== "playing" || tapped !== null || !puzzle) return;
    const ok = position === puzzle.wrong;
    setTapped(position);
    if (ok) {
      sound.correct();
      setCorrect((value) => value + 1);
      setLeft((value) => Math.min(value + BONUS_SECONDS, RUN_SECONDS));
    } else {
      sound.wrong();
    }
    setResults((all) => [...all, { puzzle, ok }]);
    // The corrected sentence, read aloud: the right version is what should
    // stay in the ear, not the wrong one.
    const fixed = puzzle.words.map((word, i) => (i === puzzle.wrong ? puzzle.right : word)).join(" ");
    say(fixed, 0.92);
    window.setTimeout(() => {
      setTapped(null);
      if (index + 1 >= run.length) return setPhase("over");
      setIndex(index + 1);
    }, 2200);
  }

  function start() {
    sound.armSound();
    sound.setMuted(sound.readMuted());
    posted.current = false;
    const next = serverRun.current ? opening : buildRun(own, Math.random);
    serverRun.current = false;
    setRun(next);
    setPhase("playing");
    setIndex(0);
    setTapped(null);
    setCorrect(0);
    setResults([]);
    setLeft(RUN_SECONDS);
    track("game_started", { where: "errore" });
  }

  if (phase === "ready") {
    return (
      <div className={styles.over}>
        <h2>Trova l&rsquo;errore</h2>
        <p>
          Ogni frase ha una parola sbagliata. Tocca quella. Sam ti dice subito qual era giusta e perché, e te la legge come andava detta.
          {ownCount > 0
            ? ` ${ownCount === 1 ? "Una frase è tua" : `${ownCount} frasi sono tue`}: le hai dette davvero, e Sam le ha corrette.`
            : " Man mano che ti alleni, le frasi diventano le tue."}
        </p>
        <button type="button" className={styles.go} onClick={start}>Inizia →</button>
        <p className={styles.footnote} style={{ textAlign: "center" }}>
          {RUN_SECONDS} secondi in tutto{best > 0 ? ` · record ${best}/8` : ""}
        </p>
      </div>
    );
  }

  if (phase === "over") {
    return (
      <div className={styles.over}>
        <h2>Fine</h2>
        <div className={styles.finalScore}>{correct}/{results.length || run.length}</div>
        <p>{verdict(correct, results.length)}</p>
        <ul className={styles.review}>
          {results.map((result, i) => (
            <li key={i}>
              <b className={result.ok ? styles.ok : styles.ko}>
                {result.ok ? "✓" : "✗"} {result.puzzle.words[result.puzzle.wrong]} → {result.puzzle.right}
              </b>
              <em>{result.puzzle.why}</em>
            </li>
          ))}
        </ul>
        <button type="button" className={styles.go} onClick={start}>Ancora →</button>
        <Link href="/giochi" className={styles.link}>Torna ai giochi</Link>
      </div>
    );
  }

  if (!puzzle) return null;
  const seconds = Math.ceil(left);
  const low = seconds <= 15;

  return (
    <div className={styles.game}>
      <div className={styles.hud}>
        <div className={styles.hudCell}><strong>{index + 1}/{run.length}</strong><span>frase</span></div>
        <div className={`${styles.hudCell} ${low ? styles.low : ""}`}><strong>{seconds}</strong><span>secondi</span></div>
        <div className={styles.hudCell}><strong>{correct}</strong><span>trovati</span></div>
      </div>
      <div className={styles.clock} data-low={low} aria-hidden>
        <i className={styles.live} style={{ width: `${Math.max(0, (left / RUN_SECONDS) * 100)}%` }} />
      </div>

      <div className={quiz.card}>
        <span className={quiz.way}>{puzzle.itemText ? "una frase tua" : "tocca la parola sbagliata"}</span>
        <p className={quiz.sentence}>
          {puzzle.words.map((word, i) => {
            const state =
              tapped === null
                ? ""
                : i === puzzle.wrong
                  ? quiz.badWord
                  : i === tapped
                    ? quiz.missWord
                    : "";
            return (
              <button
                key={i}
                type="button"
                className={`${quiz.word} ${state}`}
                onClick={() => tap(i)}
                disabled={tapped !== null}
              >
                {word}
              </button>
            );
          })}
        </p>
      </div>

      {tapped !== null ? (
        <div className={quiz.explain}>
          <p className={quiz.fix}>{puzzle.words[puzzle.wrong]} → <strong>{puzzle.right}</strong></p>
          <p className={quiz.why}>{puzzle.why}</p>
        </div>
      ) : null}
    </div>
  );
}

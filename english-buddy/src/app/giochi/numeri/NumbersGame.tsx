"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { track } from "@/lib/track-client";
import {
  BONUS_SECONDS,
  buildRun,
  isRight,
  RUN_SECONDS,
  verdict,
  type NumberQuestion,
} from "@/lib/games/numbers";
import * as sound from "@/lib/games/sound";
import { hush, say } from "@/lib/games/speak";
import styles from "../games.module.css";
import quiz from "../quiz.module.css";

type Phase = "ready" | "playing" | "over";
const BEST_KEY = "execlingo:numeri:best";
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

export function NumbersGame({ opening }: { opening: NumberQuestion[] }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [run, setRun] = useState<NumberQuestion[]>(opening);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [judged, setJudged] = useState<null | boolean>(null);
  const [correct, setCorrect] = useState(0);
  const [left, setLeft] = useState(RUN_SECONDS);
  const [results, setResults] = useState<{ written: string; ok: boolean; spoken: string }[]>([]);
  const best = useSyncExternalStore(subscribeBest, bestSnapshot, () => 0);
  const posted = useRef(false);
  const serverRun = useRef(true);
  const field = useRef<HTMLInputElement>(null);

  const question = run[index];

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
      body: JSON.stringify({ game: "numeri", score: correct, correct, total: results.length, items: [] }),
    }).catch(() => undefined);
  }, [phase, correct, results.length]);

  useEffect(
    () => () => {
      sound.releaseSound();
      hush();
    },
    []
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (phase !== "playing" || judged !== null || !question) return;
    const ok = isRight(typed, question.answer);
    setJudged(ok);
    if (ok) {
      sound.correct();
      setCorrect((value) => value + 1);
      setLeft((value) => Math.min(value + BONUS_SECONDS, RUN_SECONDS));
    } else {
      sound.wrong();
    }
    setResults((all) => [...all, { written: question.written, ok, spoken: question.spoken }]);
    window.setTimeout(() => {
      setJudged(null);
      setTyped("");
      if (index + 1 >= run.length) return setPhase("over");
      setIndex(index + 1);
      say(run[index + 1].spoken);
      field.current?.focus();
    }, 1100);
  }

  function start() {
    sound.armSound();
    sound.setMuted(sound.readMuted());
    posted.current = false;
    const next = serverRun.current ? opening : buildRun(Math.random);
    serverRun.current = false;
    setRun(next);
    setPhase("playing");
    setIndex(0);
    setTyped("");
    setJudged(null);
    setCorrect(0);
    setResults([]);
    setLeft(RUN_SECONDS);
    say(next[0].spoken);
    track("game_started", { where: "numeri" });
  }

  if (phase === "ready") {
    return (
      <div className={styles.over}>
        <h2>Numeri e cifre</h2>
        <p>
          Sam dice un numero in inglese — un prezzo, una percentuale, un anno — e tu lo scrivi in cifre.
          È il punto in cui in riunione ci si blocca davvero: <strong>fifteen</strong> o <strong>fifty</strong>, uno zero in più o in meno.
          Dieci numeri, un solo cronometro, {BONUS_SECONDS} secondi di premio per ogni risposta giusta.
        </p>
        <button type="button" className={styles.go} onClick={start}>Inizia →</button>
        <p className={styles.footnote} style={{ textAlign: "center" }}>
          {RUN_SECONDS} secondi in tutto{best > 0 ? ` · record ${best}/10` : ""} · alza il volume
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
              <b className={result.ok ? styles.ok : styles.ko}>{result.ok ? "✓" : "✗"} {result.written}</b>
              <em>{result.spoken}</em>
            </li>
          ))}
        </ul>
        <button type="button" className={styles.go} onClick={start}>Ancora →</button>
        <Link href="/giochi" className={styles.link}>Torna ai giochi</Link>
      </div>
    );
  }

  if (!question) return null;
  const seconds = Math.ceil(left);
  const low = seconds <= 15;

  return (
    <div className={styles.game}>
      <div className={styles.hud}>
        <div className={styles.hudCell}><strong>{index + 1}/{run.length}</strong><span>numero</span></div>
        <div className={`${styles.hudCell} ${low ? styles.low : ""}`}><strong>{seconds}</strong><span>secondi</span></div>
        <div className={styles.hudCell}><strong>{correct}</strong><span>giusti</span></div>
      </div>
      <div className={styles.clock} data-low={low} aria-hidden>
        <i className={styles.live} style={{ width: `${Math.max(0, (left / RUN_SECONDS) * 100)}%` }} />
      </div>

      <div className={quiz.ear}>
        <button type="button" className={quiz.speaker} onClick={() => say(question.spoken)} aria-label="Riascolta il numero">
          🔊
        </button>
        <p className={quiz.prompt}>{question.context}</p>
      </div>

      <form onSubmit={submit} className={quiz.typing}>
        <input
          ref={field}
          className={`${quiz.field} ${judged === true ? quiz.right : judged === false ? quiz.wrong : ""}`}
          inputMode="decimal"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="scrivi in cifre"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          disabled={judged !== null}
          aria-label="Il numero che hai sentito"
        />
        <button type="submit" className={styles.go} disabled={judged !== null || typed.trim() === ""}>
          Conferma
        </button>
      </form>

      {judged !== null ? (
        <p className={quiz.reveal}>
          {judged ? question.written : <>Era <strong>{question.written}</strong></>}
        </p>
      ) : null}
    </div>
  );
}

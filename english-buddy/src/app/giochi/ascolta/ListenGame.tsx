"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { track } from "@/lib/track-client";
import { tuneSamUtterance } from "@/lib/voice-prefs";
import { BONUS_SECONDS, buildRun, RUN_SECONDS, verdict, type Question } from "@/lib/games/listen";
import type { Entry } from "@/lib/games/glossary";
import * as sound from "@/lib/games/sound";
import styles from "../games.module.css";
import quiz from "../quiz.module.css";

type Phase = "ready" | "playing" | "over";
const BEST_KEY = "execlingo:ascolta:best";
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

/**
 * The word, spoken. The device's own voice is instant and free, which matters
 * when ten questions arrive one after another; the server voice is the
 * fallback for the Android shell, which has no synthesiser behind it.
 */
function say(word: string): void {
  try {
    if ("speechSynthesis" in window) {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length || voices.some((v) => v.lang.replace("_", "-").startsWith("en"))) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(tuneSamUtterance(new SpeechSynthesisUtterance(word), "en-US", 0.9));
        return;
      }
    }
  } catch {
    /* fall through to the server voice */
  }
  void fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: word, rate: 0.9, lang: "en-US" }),
  })
    .then((response) => (response.ok ? response.blob() : null))
    .then((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      void audio.play().catch(() => undefined);
      audio.onended = () => URL.revokeObjectURL(url);
    })
    .catch(() => undefined);
}

export function ListenGame({ opening, own }: { opening: Question[]; own: Entry[] }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [run, setRun] = useState<Question[]>(opening);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [left, setLeft] = useState(RUN_SECONDS);
  const [results, setResults] = useState<{ word: string; it: string; ok: boolean; itemText: string | null }[]>([]);
  const best = useSyncExternalStore(subscribeBest, bestSnapshot, () => 0);
  const posted = useRef(false);
  /** The server dealt the first run; every replay is dealt here. */
  const serverRun = useRef(true);

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
      body: JSON.stringify({
        game: "ascolta",
        score: correct,
        correct,
        total: results.length,
        items: results.filter((r) => r.itemText).map((r) => ({ itemText: r.itemText, success: r.ok })),
      }),
    }).catch(() => undefined);
  }, [phase, correct, results]);

  useEffect(
    () => () => {
      sound.releaseSound();
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* nothing was speaking */
      }
    },
    []
  );

  function choose(option: number) {
    if (phase !== "playing" || chosen !== null || !question) return;
    const ok = option === question.answer;
    setChosen(option);
    if (ok) {
      sound.correct();
      setCorrect((value) => value + 1);
      setLeft((value) => Math.min(value + BONUS_SECONDS, RUN_SECONDS));
    } else {
      sound.wrong();
    }
    setResults((all) => [...all, { word: question.word, it: question.options[question.answer], ok, itemText: question.itemText }]);
    window.setTimeout(() => {
      setChosen(null);
      if (index + 1 >= run.length) return setPhase("over");
      setIndex(index + 1);
      say(run[index + 1].word);
    }, 900);
  }

  function start() {
    sound.armSound();
    sound.setMuted(sound.readMuted());
    posted.current = false;
    setPhase("playing");
    setIndex(0);
    setChosen(null);
    setCorrect(0);
    setResults([]);
    setLeft(RUN_SECONDS);
    const next = serverRun.current ? opening : buildRun(own, Math.random);
    serverRun.current = false;
    setRun(next);
    say(next[0].word);
    track("game_started", { where: "ascolta" });
  }

  if (phase === "ready") {
    return (
      <div className={styles.over}>
        <h2>Ascolta e scegli</h2>
        <p>
          Dieci parole, una dopo l&rsquo;altra. Sam le pronuncia in inglese, tu scegli il significato giusto fra tre.
          Un solo cronometro per tutte: ogni risposta giusta te ne ridà {BONUS_SECONDS}. Puoi riascoltare quante volte vuoi, ma il tempo scorre.
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
            <li key={`${result.word}-${i}`}>
              <b className={result.ok ? styles.ok : styles.ko}>{result.ok ? "✓" : "✗"} {result.word}</b>
              <em>{result.it}</em>
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
  const low = seconds <= 12;

  return (
    <div className={styles.game}>
      <div className={styles.hud}>
        <div className={styles.hudCell}><strong>{index + 1}/{run.length}</strong><span>domanda</span></div>
        <div className={`${styles.hudCell} ${low ? styles.low : ""}`}><strong>{seconds}</strong><span>secondi</span></div>
        <div className={styles.hudCell}><strong>{correct}</strong><span>giuste</span></div>
      </div>
      <div className={styles.clock} data-low={low} aria-hidden>
        <i className={styles.live} style={{ width: `${Math.max(0, (left / RUN_SECONDS) * 100)}%` }} />
      </div>

      <div className={quiz.ear}>
        <button type="button" className={quiz.speaker} onClick={() => say(question.word)} aria-label="Riascolta la parola">
          🔊
        </button>
        <p className={quiz.prompt}>Che cosa hai sentito?</p>
      </div>

      <div className={quiz.options}>
        {question.options.map((option, i) => {
          const state = chosen === null ? "" : i === question.answer ? quiz.right : i === chosen ? quiz.wrong : quiz.dim;
          return (
            <button key={option} type="button" className={`${quiz.option} ${state}`} onClick={() => choose(i)} disabled={chosen !== null}>
              {option}
            </button>
          );
        })}
      </div>

      {chosen !== null ? <p className={quiz.reveal}>{question.word}</p> : null}
    </div>
  );
}

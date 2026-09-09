"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { track } from "@/lib/track-client";
import { buildDeck, RUN_SECONDS, verdict, WRONG_SECONDS, type Card } from "@/lib/games/flash";
import type { Entry } from "@/lib/games/glossary";
import * as sound from "@/lib/games/sound";
import { hush, say } from "@/lib/games/speak";
import styles from "../games.module.css";
import quiz from "../quiz.module.css";

type Phase = "ready" | "playing" | "over";
const BEST_KEY = "execlingo:flash:best";
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

export function FlashGame({ opening, own }: { opening: Card[]; own: Entry[] }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [deck, setDeck] = useState<Card[]>(opening);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [left, setLeft] = useState(RUN_SECONDS);
  const [missed, setMissed] = useState<Card[]>([]);
  const [reviewed, setReviewed] = useState<{ itemText: string; success: boolean }[]>([]);
  const best = useSyncExternalStore(subscribeBest, bestSnapshot, () => 0);
  const posted = useRef(false);
  const serverDeck = useRef(true);

  const card = deck[index];

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
        game: "flash",
        score: correct,
        correct,
        total: correct + missed.length,
        items: reviewed.slice(0, 50),
      }),
    }).catch(() => undefined);
  }, [phase, correct, missed.length, reviewed]);

  useEffect(
    () => () => {
      sound.releaseSound();
      hush();
    },
    []
  );

  function choose(option: number) {
    if (phase !== "playing" || chosen !== null || !card) return;
    const ok = option === card.answer;
    setChosen(option);
    if (ok) {
      sound.correct();
      setCorrect((value) => value + 1);
    } else {
      sound.wrong();
      setLeft((value) => Math.max(0.1, value - WRONG_SECONDS));
      setMissed((all) => [...all, card]);
    }
    if (card.itemText) setReviewed((all) => [...all, { itemText: card.itemText as string, success: ok }]);
    // Hearing the English is the reward for getting it right, and the
    // correction for getting it wrong.
    say(card.word, 0.95);
    window.setTimeout(() => {
      setChosen(null);
      if (index + 1 >= deck.length) return setPhase("over");
      setIndex(index + 1);
    }, ok ? 420 : 900);
  }

  function start() {
    sound.armSound();
    sound.setMuted(sound.readMuted());
    posted.current = false;
    const next = serverDeck.current ? opening : buildDeck(own, Math.random);
    serverDeck.current = false;
    setDeck(next);
    setPhase("playing");
    setIndex(0);
    setChosen(null);
    setCorrect(0);
    setMissed([]);
    setReviewed([]);
    setLeft(RUN_SECONDS);
    track("game_started", { where: "flash" });
  }

  if (phase === "ready") {
    return (
      <div className={styles.over}>
        <h2>Flash IT ↔ EN</h2>
        <p>
          Un minuto, parole a raffica, e la direzione cambia in continuazione: una volta vedi l&rsquo;inglese e scegli l&rsquo;italiano,
          quella dopo il contrario. Riconoscere una parola e tirarla fuori sono due cose diverse — qui le alleni tutte e due.
          Ogni errore ti toglie {WRONG_SECONDS} secondi.
        </p>
        <button type="button" className={styles.go} onClick={start}>Inizia →</button>
        <p className={styles.footnote} style={{ textAlign: "center" }}>
          {RUN_SECONDS} secondi{best > 0 ? ` · record ${best}` : ""}
        </p>
      </div>
    );
  }

  if (phase === "over") {
    return (
      <div className={styles.over}>
        <h2>Tempo scaduto</h2>
        <div className={styles.finalScore}>{correct}</div>
        <p>{correct === 1 ? "una parola" : `${correct} parole`}. {verdict(correct)}</p>
        {missed.length > 0 ? (
          <>
            <p className={styles.footnote} style={{ textAlign: "left" }}>Quelle che ti sono sfuggite:</p>
            <ul className={styles.review}>
              {missed.map((card, i) => (
                <li key={`${card.word}-${i}`}>
                  <b className={styles.ko}>{card.word}</b>
                  <em>{card.it}</em>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <button type="button" className={styles.go} onClick={start}>Ancora →</button>
        <Link href="/giochi" className={styles.link}>Torna ai giochi</Link>
      </div>
    );
  }

  if (!card) return null;
  const seconds = Math.ceil(left);
  const low = seconds <= 10;

  return (
    <div className={styles.game}>
      <div className={styles.hud}>
        <div className={styles.hudCell}><strong>{correct}</strong><span>parole</span></div>
        <div className={`${styles.hudCell} ${low ? styles.low : ""}`}><strong>{seconds}</strong><span>secondi</span></div>
        <div className={styles.hudCell}><strong>{best}</strong><span>record</span></div>
      </div>
      <div className={styles.clock} data-low={low} aria-hidden>
        <i className={styles.live} style={{ width: `${Math.max(0, (left / RUN_SECONDS) * 100)}%` }} />
      </div>

      <div className={quiz.card}>
        <span className={quiz.way}>{card.direction === "en-it" ? "inglese → italiano" : "italiano → inglese"}</span>
        <p className={quiz.big}>{card.prompt}</p>
      </div>

      <div className={quiz.options}>
        {card.options.map((option, i) => {
          const state = chosen === null ? "" : i === card.answer ? quiz.right : i === chosen ? quiz.wrong : quiz.dim;
          return (
            <button key={option} type="button" className={`${quiz.option} ${state}`} onClick={() => choose(i)} disabled={chosen !== null}>
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

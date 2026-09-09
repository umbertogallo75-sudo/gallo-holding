"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { track } from "@/lib/track-client";
import { ROUND_SECONDS, roundScore, verdict, type Round } from "@/lib/games/word-sprint";
import styles from "../games.module.css";

type Phase = "loading" | "ready" | "playing" | "reveal" | "over" | "error";
type Result = { word: string; hint: string; itemText: string | null; success: boolean };

const BEST_KEY = "execlingo:word-sprint:best";

/**
 * The personal best lives in localStorage, which is an external store rather
 * than React state: read through useSyncExternalStore so the value is there on
 * the first client render instead of arriving as a second one.
 */
const bestListeners = new Set<() => void>();
let bestCache: number | null = null;

function bestSnapshot(): number {
  if (bestCache === null) {
    try {
      bestCache = Number(window.localStorage.getItem(BEST_KEY) ?? 0) || 0;
    } catch {
      bestCache = 0;
    }
  }
  return bestCache;
}

function subscribeBest(listener: () => void): () => void {
  bestListeners.add(listener);
  return () => bestListeners.delete(listener);
}

function saveBest(value: number): void {
  if (value <= bestSnapshot()) return;
  bestCache = value;
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Private browsing: the record simply is not remembered.
  }
  for (const listener of bestListeners) listener();
}

export function WordSprint({ initial }: { initial: { rounds: Round[]; ownWords: number } }) {
  const [phase, setPhase] = useState<Phase>(initial.rounds.length ? "ready" : "error");
  const [rounds, setRounds] = useState<Round[]>(initial.rounds);
  const [ownWords, setOwnWords] = useState(initial.ownWords);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [flash, setFlash] = useState<{ kind: "right" | "wrong"; text: string } | null>(null);
  const best = useSyncExternalStore(subscribeBest, bestSnapshot, () => 0);
  const posted = useRef(false);

  const round: Round | undefined = rounds[index];

  // Only the replay path: the first game is dealt by the server and arrives as
  // a prop, so opening the page costs no round trip and shows no spinner.
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/giochi/round", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { rounds?: Round[]; ownWords?: number };
      if (!response.ok || !data.rounds?.length) return setPhase("error");
      setRounds(data.rounds);
      setOwnWords(data.ownWords ?? 0);
      setIndex(0);
      setPicked([]);
      setScore(0);
      setStreak(0);
      setResults([]);
      setFlash(null);
      setSecondsLeft(ROUND_SECONDS);
      posted.current = false;
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, []);

  const restart = useCallback(() => {
    setPhase("loading");
    void load();
  }, [load]);

  const finishRound = useCallback(
    (success: boolean, leftOnClock: number) => {
      const current = rounds[index];
      if (!current) return;
      if (success) {
        setScore((value) => value + roundScore(leftOnClock, streak));
        setStreak((value) => value + 1);
        setFlash({ kind: "right", text: "Esatto." });
      } else {
        setStreak(0);
        setFlash({ kind: "wrong", text: `Era «${current.word}».` });
      }
      setResults((all) => [...all, { word: current.word, hint: current.hint, itemText: current.itemText, success }]);
      setPhase("reveal");
    },
    [index, rounds, streak]
  );

  // The clock. Only runs while a round is actually being played, and the tick
  // that reaches zero ends the round as a miss.
  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          finishRound(false, 0);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, finishRound]);

  function tapKey(position: number) {
    if (phase !== "playing" || !round) return;
    if (picked.includes(position)) return;
    const next = [...picked, position];
    setPicked(next);
    if (next.length < round.word.length) return;
    const attempt = next.map((i) => round.tray[i]).join("");
    finishRound(attempt === round.word, secondsLeft);
  }

  function nextRound() {
    setFlash(null);
    setPicked([]);
    setSecondsLeft(ROUND_SECONDS);
    if (index + 1 >= rounds.length) return setPhase("over");
    setIndex(index + 1);
    setPhase("playing");
  }

  function start() {
    setPhase("playing");
    track("game_started", { where: "word-sprint" });
  }

  // The end of a game: the score is kept locally, the reviews go to the server
  // exactly once even if this screen is re-rendered.
  useEffect(() => {
    if (phase !== "over" || posted.current) return;
    posted.current = true;
    const correct = results.filter((r) => r.success).length;
    saveBest(score);
    void fetch("/api/giochi/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: "word-sprint",
        score,
        correct,
        total: results.length,
        items: results.filter((r) => r.itemText).map((r) => ({ itemText: r.itemText, success: r.success })),
      }),
    }).catch(() => {
      /* the game is over either way */
    });
  }, [phase, results, score]);

  if (phase === "loading") return <p className="muted">Preparo le parole…</p>;

  if (phase === "error") {
    return (
      <div className={styles.over}>
        <h2>Non riesco a preparare la partita</h2>
        <p className="muted" style={{ margin: 0 }}>Riprova tra un attimo: le tue parole restano dove sono.</p>
        <button className="primary full" onClick={restart}>Riprova</button>
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <div className={styles.over}>
        <h2>Word Sprint</h2>
        <p className="muted" style={{ margin: 0 }}>
          {ownWords > 0
            ? `${ownWords} ${ownWords === 1 ? "parola tua" : "parole tue"} in questa partita: quelle che hai sbagliato con Sam. Ricomponile prima che scada il tempo — quelle che sbagli tornano prima.`
            : "Otto parole del lavoro, trenta secondi ciascuna. Man mano che ti alleni con Sam, il gioco passa alle parole che sbagli tu."}
        </p>
        <button className="primary full" onClick={start}>Inizia →</button>
        <p className="itHint" style={{ margin: 0, textAlign: "center" }}>{ROUND_SECONDS} secondi a parola · {rounds.length} parole{best > 0 ? ` · record ${best}` : ""}</p>
      </div>
    );
  }

  if (phase === "over") {
    const correct = results.filter((r) => r.success).length;
    const mine = results.filter((r) => r.itemText).length;
    return (
      <div className={styles.over}>
        <h2>Fine partita</h2>
        <div className={styles.finalScore}>{score}</div>
        <p className="muted" style={{ margin: 0 }}>
          {correct} su {results.length}. {verdict(correct, results.length)}
          {mine > 0 ? ` ${mine === 1 ? "Una parola tua è stata" : `${mine} parole tue sono state`} ripassata${mine === 1 ? "" : "e"}: Sam ne terrà conto.` : ""}
        </p>
        <ul className={styles.review}>
          {results.map((result, i) => (
            <li key={`${result.word}-${i}`}>
              <b className={result.success ? styles.ok : styles.ko}>{result.success ? "✓" : "✗"} {result.word}</b>
              <em>{result.hint}</em>
            </li>
          ))}
        </ul>
        <button className="primary full" onClick={restart}>Un&rsquo;altra partita</button>
        <Link href="/giochi" className="secondary full" style={{ textAlign: "center" }}>Torna ai giochi</Link>
        {best > 0 ? <p className="itHint" style={{ margin: 0, textAlign: "center" }}>Record personale: {best}</p> : null}
      </div>
    );
  }

  if (!round) return null;
  const low = secondsLeft <= 8;
  const state = phase === "reveal" ? (flash?.kind === "right" ? styles.right : styles.wrong) : "";

  return (
    <div className={styles.game}>
      <div className={styles.hud}>
        <div className={styles.hudCell}><strong>{index + 1}/{rounds.length}</strong><span>parola</span></div>
        <div className={`${styles.hudCell} ${low ? styles.low : ""}`}><strong>{secondsLeft}</strong><span>secondi</span></div>
        <div className={styles.hudCell}><strong>{score}</strong><span>punti</span></div>
      </div>
      <div className={styles.clock} data-low={low} aria-hidden>
        <i style={{ width: `${(secondsLeft / ROUND_SECONDS) * 100}%` }} />
      </div>

      <div className={`${styles.prompt} ${state}`}>
        <p className={styles.hint}>{round.hint}</p>
        <div className={styles.slots} aria-live="polite">
          {Array.from({ length: round.word.length }, (_, i) => {
            const position = picked[i];
            const letter = position === undefined ? "" : round.tray[position];
            return (
              <span key={i} className={letter ? `${styles.slot} ${styles.slotFilled}` : styles.slot}>
                {phase === "reveal" && !letter ? round.word[i] : letter}
              </span>
            );
          })}
        </div>
        <p className={flash ? `${styles.flash} ${flash.kind === "right" ? styles.flashRight : styles.flashWrong}` : styles.flash}>
          {flash?.text ?? ""}
        </p>
      </div>

      {phase === "playing" ? (
        <>
          <div className={styles.tray}>
            {round.tray.map((letter, position) => (
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
            <button type="button" className={styles.ghost} onClick={() => finishRound(false, secondsLeft)}>
              Passa
            </button>
          </div>
        </>
      ) : (
        <div className={styles.controls}>
          <button type="button" className="primary" onClick={nextRound}>
            {index + 1 >= rounds.length ? "Vedi il risultato →" : "Avanti →"}
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { track } from "@/lib/track-client";
import {
  ACCENTS,
  buildGame,
  isAccent,
  judge,
  nextLevel,
  SECONDS_PER_SENTENCE,
  SENTENCES_PER_GAME,
  verdict,
  type Accent,
  type Round,
} from "@/lib/games/dictation";
import * as sound from "@/lib/games/sound";
import { hush, prime, say, unlockGameAudio } from "@/lib/games/speak";
import styles from "../games.module.css";
import quiz from "../quiz.module.css";
import own from "./dettato.module.css";

type Phase = "ready" | "playing" | "over";
const LEVEL_KEY = "execlingo:dettato:level";
const ACCENT_KEY = "execlingo:dettato:accent";
const TICK_MS = 200;

function readLevel(): number {
  try {
    return Number(window.localStorage.getItem(LEVEL_KEY) ?? 1) || 1;
  } catch {
    return 1;
  }
}

function readAccent(): Accent {
  try {
    const saved = window.localStorage.getItem(ACCENT_KEY);
    return isAccent(saved) ? saved : "en-GB";
  } catch {
    return "en-GB";
  }
}

/**
 * Ascolta e scrivi.
 *
 * A dictation, and nothing else: no microphone anywhere on this screen,
 * because a written exercise with a speak button is a name that lies about
 * what it is. Ten sentences, thirty seconds each, a score, and a level that
 * only moves when all ten are perfect.
 */
export function Dictation() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [level, setLevel] = useState(1);
  const [accent, setAccent] = useState<Accent>("en-GB");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [left, setLeft] = useState(SECONDS_PER_SENTENCE);
  const [score, setScore] = useState(0);
  const [perfect, setPerfect] = useState(0);
  const [shown, setShown] = useState<null | { sentence: string; missed: string[]; perfect: boolean }>(null);
  const [results, setResults] = useState<{ sentence: string; perfect: boolean; share: number }[]>([]);
  const [climbed, setClimbed] = useState(false);
  const posted = useRef(false);
  const field = useRef<HTMLTextAreaElement>(null);

  // Read on the client only: the server has no idea what this device chose.
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    setLevel(readLevel());
    setAccent(readAccent());
  }, []);

  const round = rounds[index];

  useEffect(() => {
    if (phase !== "playing" || shown) return;
    const timer = window.setInterval(() => {
      setLeft((value) => {
        const next = value - TICK_MS / 1000;
        if (next <= 0) {
          window.clearInterval(timer);
          return 0;
        }
        return next;
      });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [phase, shown, index]);

  // Out of time is an answer too: whatever is written when the clock stops.
  const expired = phase === "playing" && left <= 0 && !shown;
  useEffect(() => {
    if (expired) check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  useEffect(() => {
    if (phase !== "over" || posted.current) return;
    posted.current = true;
    void fetch("/api/palestra/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: "dettato", score, correct: perfect, total: results.length, items: [] }),
    }).catch(() => undefined);
  }, [phase, score, perfect, results.length]);

  useEffect(() => () => { sound.releaseSound(); hush(); }, []);

  function speakCurrent(rounds_: Round[] = rounds, at = index, lang: Accent = accent) {
    const next = rounds_[at];
    if (next) say(next.sentence, 0.95, lang);
    if (rounds_[at + 1]) prime(rounds_[at + 1].sentence, 0.95, lang);
  }

  function check() {
    if (!round || shown) return;
    const result = judge(round.sentence, typed, left);
    if (result.perfect) { sound.correct(); setPerfect((value) => value + 1); }
    else sound.wrong();
    setScore((value) => value + result.points);
    setResults((all) => [...all, { sentence: round.sentence, perfect: result.perfect, share: result.share }]);
    setShown({ sentence: round.sentence, missed: result.missed, perfect: result.perfect });
  }

  function advance() {
    setShown(null);
    setTyped("");
    setLeft(SECONDS_PER_SENTENCE);
    if (index + 1 >= rounds.length) {
      const climbedNow = nextLevel(level, perfect, results.length) > level;
      if (climbedNow) {
        setClimbed(true);
        const raised = nextLevel(level, perfect, results.length);
        setLevel(raised);
        try { window.localStorage.setItem(LEVEL_KEY, String(raised)); } catch { /* private browsing */ }
      }
      setPhase("over");
      return;
    }
    setIndex(index + 1);
    speakCurrent(rounds, index + 1);
    field.current?.focus();
  }

  function start() {
    unlockGameAudio();
    sound.armSound();
    sound.setMuted(sound.readMuted());
    posted.current = false;
    const next = buildGame(level, Math.random);
    setRounds(next);
    setPhase("playing");
    setIndex(0);
    setTyped("");
    setLeft(SECONDS_PER_SENTENCE);
    setScore(0);
    setPerfect(0);
    setResults([]);
    setShown(null);
    setClimbed(false);
    speakCurrent(next, 0);
    track("game_started", { where: "dettato" });
  }

  function chooseAccent(key: Accent) {
    setAccent(key);
    try { window.localStorage.setItem(ACCENT_KEY, key); } catch { /* private browsing */ }
  }

  if (phase === "ready") {
    return (
      <div className={styles.over}>
        <h1 className={styles.title}>Ascolta e scrivi</h1>
        <p className={styles.footnote}>
          Dieci frasi, {SECONDS_PER_SENTENCE} secondi ciascuna. Senti, scrivi quello che hai capito. Fai dieci su dieci e
          il livello sale.
        </p>

        <div className={own.accentHead}>Con che accento?</div>
        <div className={own.accents}>
          {ACCENTS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={option.key === accent ? `${own.accent} ${own.accentOn}` : own.accent}
              onClick={() => chooseAccent(option.key)}
            >
              <span className={own.flag} aria-hidden>{option.flag}</span>
              <strong>{option.label}</strong>
              <span className={own.accentNote}>{option.note}</span>
            </button>
          ))}
        </div>

        <p className={styles.footnote}>Livello {level} di 5 · l&rsquo;accento non cambia il livello, cambia la fatica.</p>
        <button type="button" className={styles.go} onClick={start}>Inizia →</button>
        <Link className={styles.back} href="/palestra">← Palestra</Link>
      </div>
    );
  }

  if (phase === "over") {
    return (
      <div className={styles.over}>
        <h1 className={styles.title}>{score} punti</h1>
        <p className={styles.footnote}>{verdict(perfect, results.length, climbed)}</p>
        <p className={styles.footnote}>
          {perfect} frasi su {results.length} perfette · livello {level}
        </p>
        <div className={own.review}>
          {results.map((result, i) => (
            <p key={i} className={result.perfect ? own.reviewOk : own.reviewMiss}>
              {result.perfect ? "✓" : `${Math.round(result.share * 100)}%`} {result.sentence}
            </p>
          ))}
        </div>
        <button type="button" className={styles.go} onClick={start}>Ancora →</button>
        <Link className={styles.back} href="/palestra">← Palestra</Link>
      </div>
    );
  }

  const seconds = Math.ceil(left);
  const low = seconds <= 8;

  return (
    <div className={styles.game}>
      <div className={styles.hud}>
        <div className={styles.hudCell}><strong>{score}</strong><span>punti</span></div>
        <div className={`${styles.hudCell} ${low && !shown ? styles.low : ""}`}><strong>{shown ? "—" : seconds}</strong><span>secondi</span></div>
        <div className={styles.hudCell}><strong>{index + 1}/{SENTENCES_PER_GAME}</strong><span>frase</span></div>
      </div>

      <div className={own.stage}>
        <button type="button" className={quiz.speaker} onClick={() => speakCurrent()} aria-label="Riascolta la frase">
          🔊
        </button>
        <p className={own.hint}>Riascoltala quante volte vuoi: il tempo però corre.</p>

        {shown ? (
          <div className={shown.perfect ? own.answerOk : own.answerMiss}>
            <p className={own.answerSentence}>{shown.sentence}</p>
            {shown.missed.length ? (
              <p className={own.missed}>Ti sono sfuggite: {shown.missed.join(", ")}</p>
            ) : (
              <p className={own.missed}>Perfetta.</p>
            )}
            <button type="button" className={styles.go} onClick={advance}>
              {index + 1 >= rounds.length ? "Vedi il risultato →" : "Avanti →"}
            </button>
          </div>
        ) : (
          <form
            className={own.form}
            onSubmit={(event) => { event.preventDefault(); check(); }}
          >
            <textarea
              ref={field}
              className={own.field}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Scrivi quello che hai sentito…"
              rows={3}
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <button type="submit" className={styles.go} disabled={!typed.trim()}>Controlla →</button>
          </form>
        )}
      </div>
    </div>
  );
}

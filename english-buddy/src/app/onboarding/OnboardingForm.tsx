"use client";
import { useEffect, useState } from "react";
import { track } from "@/lib/track-client";
import { useRouter } from "next/navigation";

/**
 * The three questions asked before the first session.
 *
 * It used to be a form: a name to type, a free-text box about your job, a
 * multi-select of goals, three screens with a Continue button on each. People
 * who had just signed up were asked to write about themselves before they had
 * seen the product do anything.
 *
 * Now it is three taps. Each answer moves to the next question by itself, and
 * "Salta" takes the defaults — because an answer given to get past a screen is
 * worse than no answer at all, and the coach recalibrates from real
 * conversations anyway. The name is not asked: it was given at registration.
 */

type Choice = { value: string; label: string; meta: string };

const LEVELS: Choice[] = [
  { value: "zero", label: "Parto da zero", meta: "Conosco pochissime parole" },
  { value: "basics", label: "Capisco qualcosa", meta: "Leggo un po', ma parlare è un'altra cosa" },
  { value: "independent", label: "Me la cavo", meta: "Mi faccio capire, ma sono lento" },
  { value: "business", label: "Ho già una base", meta: "Mi serve quello professionale" },
];

const GOALS: Choice[] = [
  { value: "Riunioni e call", label: "Riunioni e call", meta: "Parlare quando tocca a me" },
  { value: "Trattative e clienti", label: "Trattative e clienti", meta: "Numeri, prezzi, accordi" },
  { value: "Viaggi di lavoro", label: "Viaggi di lavoro", meta: "Aeroporto, hotel, cene" },
  { value: "Un po' di tutto", label: "Un po' di tutto", meta: "Decidi tu da dove partire" },
];

const TIMES: Choice[] = [
  { value: "2", label: "Due minuti", meta: "Nei ritagli, quando capita" },
  { value: "5", label: "Cinque minuti", meta: "Una volta al giorno" },
  { value: "15", label: "Un quarto d'ora", meta: "Quando posso sedermi" },
];

/** What somebody who taps "Salta" gets. The coach adjusts from there. */
const DEFAULTS = { level: "independent", goal: "Riunioni e call", minutes: "5" };

const QUESTIONS = [
  { key: "level" as const, title: "Da dove parti?", options: LEVELS },
  { key: "goal" as const, title: "A cosa ti serve?", options: GOALS },
  { key: "minutes" as const, title: "Quanto tempo hai al giorno?", options: TIMES },
];

export type OnboardingInitial = {
  name: string;
  startingLevel: string;
  goals: string[];
  context: string;
  intensity: string;
};

export function OnboardingForm({ initial }: { initial: OnboardingInitial }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => { track("onboarding_started"); }, []);

  async function finish(final: Record<string, string>) {
    setLoading(true);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: initial.name || "Amico",
        startingLevel: final.level ?? DEFAULTS.level,
        goals: [final.goal ?? DEFAULTS.goal],
        dailyMinutes: Number(final.minutes ?? DEFAULTS.minutes),
        professionalContext: initial.context,
        notificationIntensity: initial.intensity || "immersive",
        timezone,
      }),
    });
    track(Object.keys(final).length >= QUESTIONS.length ? "onboarding_done" : "onboarding_skipped");
    if (!response.ok) {
      setLoading(false);
      return router.push("/login");
    }
    router.push("/piano");
    router.refresh();
  }

  function answer(key: string, value: string) {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    if (step < QUESTIONS.length - 1) return setStep(step + 1);
    void finish(next);
  }

  const question = QUESTIONS[step];

  return (
    <main className="shell authWrap">
      <section className="authCard">
        <div className="brand">ExecLingo</div>

        <div className="stepDots" aria-label={`Domanda ${step + 1} di ${QUESTIONS.length}`}>
          {QUESTIONS.map((q, i) => (
            <span key={q.key} className={i <= step ? "stepDot on" : "stepDot"} aria-hidden />
          ))}
        </div>

        <div className="hero" style={{ margin: "18px 0 18px" }}>
          <h1>{question.title}</h1>
          <p className="muted">Un tocco e si va avanti. Niente è definitivo: Sam si ricalibra da come parli.</p>
        </div>

        {question.options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="optionRow"
            disabled={loading}
            onClick={() => answer(question.key, option.value)}
          >
            <strong>{option.label}</strong>
            <span className="muted">{option.meta}</span>
          </button>
        ))}

        <button type="button" className="skipLink" disabled={loading} onClick={() => void finish({ ...DEFAULTS, ...answers })}>
          {loading ? "Un attimo…" : "Salta"}
        </button>
      </section>
    </main>
  );
}

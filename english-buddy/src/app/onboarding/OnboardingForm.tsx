"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const GOAL_OPTIONS = ["Business calls and meetings", "Finance and investments", "Presentations", "Negotiations", "Travel", "Everyday conversation"];
const STARTING_LEVELS = [
  { value: "zero", label: "I'm starting from zero", meta: "Parto da zero — conosco pochissimo inglese e ho bisogno di un percorso guidato." },
  { value: "basics", label: "I understand a little", meta: "Capisco qualcosa — riconosco un po' di inglese ma faccio fatica a parlare." },
  { value: "independent", label: "I can manage", meta: "Me la cavo — riesco a comunicare, ma voglio diventare più fluente e sicuro." },
  { value: "business", label: "Business English", meta: "Ho già una base — voglio concentrarmi su riunioni, call, finanza e situazioni professionali." },
];
const INTENSITIES = [
  { value: "immersive", label: "Immersive", meta: "Many small touchpoints during the day · Tanti piccoli momenti durante la giornata" },
  { value: "normal", label: "Normal", meta: "A few well-timed nudges · Qualche promemoria ben piazzato" },
  { value: "low", label: "Low", meta: "Rare, only the essentials · Rari, solo l'essenziale" },
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
  const [startingLevel, setStartingLevel] = useState(initial.startingLevel);
  const [name, setName] = useState(initial.name);
  const [goals, setGoals] = useState<string[]>(initial.goals.length ? initial.goals : ["Business calls and meetings"]);
  const [context, setContext] = useState(initial.context);
  const [intensity, setIntensity] = useState(initial.intensity || "immersive");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function toggleGoal(goal: string) {
    setGoals((current) => (current.includes(goal) ? current.filter((g) => g !== goal) : [...current, goal]));
  }

  async function save() {
    setLoading(true);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name || "Friend",
        startingLevel: startingLevel || "independent",
        goals: goals.length ? goals : ["Business calls and meetings"],
        professionalContext: context,
        notificationIntensity: intensity,
        timezone,
      }),
    });
    setLoading(false);
    if (!response.ok) return router.push("/login");
    router.push("/home");
    router.refresh();
  }

  return (
    <main className="shell authWrap">
      <section className="authCard">
        <div className="brand">ExecLingo</div>
        {step === 0 && (
          <>
            <div className="hero"><div className="kicker">Step 1 of 3</div><h1>Where do you start from?</h1><p className="muted">Da dove parti? Scegli quella più vicina a te — poi mi calibro dalle conversazioni reali.</p></div>
            {STARTING_LEVELS.map((option) => (
              <button key={option.value} type="button" className={`optionRow ${startingLevel === option.value ? "optionActive" : ""}`} onClick={() => setStartingLevel(option.value)}>
                <strong>{option.label}</strong>
                <span className="muted">{option.meta}</span>
              </button>
            ))}
            <button className="primary full" style={{ marginTop: 10 }} disabled={!startingLevel} onClick={() => setStep(1)}>Continue</button>
          </>
        )}
        {step === 1 && (
          <>
            <div className="hero"><div className="kicker">Step 2 of 3</div><h1>Make it yours.</h1><p className="muted">What should I call you, and what do you want English for? · Come ti chiamo, e a cosa ti serve l&rsquo;inglese?</p></div>
            <input className="field" placeholder="First name" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="pillGroup">
              {GOAL_OPTIONS.map((goal) => (
                <button key={goal} type="button" className={`pill ${goals.includes(goal) ? "pillActive" : ""}`} onClick={() => toggleGoal(goal)}>{goal}</button>
              ))}
            </div>
            <textarea className="field" rows={3} placeholder="Your professional context (optional) — e.g. I run a holding company, evaluate acquisitions, talk to banks and investors" value={context} onChange={(e) => setContext(e.target.value)} />
            <button className="primary full" onClick={() => setStep(2)}>Continue</button>
          </>
        )}
        {step === 2 && (
          <>
            <div className="hero"><div className="kicker">Step 3 of 3</div><h1>How present should I be?</h1><p className="muted">You can change this anytime. No streaks, no guilt.</p></div>
            {INTENSITIES.map((option) => (
              <button key={option.value} type="button" className={`optionRow ${intensity === option.value ? "optionActive" : ""}`} onClick={() => setIntensity(option.value)}>
                <strong>{option.label}</strong>
                <span className="muted">{option.meta}</span>
              </button>
            ))}
            <div className="notice" style={{ margin: "6px 0 10px" }}>
              🎯 <strong>Seguimi e in 3 mesi sei operativo in inglese</strong>: riunioni, call, trasferte. Bastano pochi minuti al giorno — al ritmo ci penso io.
            </div>
            <button className="primary full" disabled={loading} onClick={save}>{loading ? "Saving…" : "Start"}</button>
          </>
        )}
      </section>
    </main>
  );
}

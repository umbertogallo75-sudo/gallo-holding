"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const GOAL_OPTIONS = ["Business calls and meetings", "Finance and investments", "Presentations", "Negotiations", "Travel", "Everyday conversation"];
const LEVELS = [
  { value: "A1", label: "A1 · Beginner" },
  { value: "A2", label: "A2 · Elementary" },
  { value: "B1", label: "B1 · Intermediate" },
  { value: "B2", label: "B2 · Upper intermediate" },
  { value: "C1", label: "C1 · Advanced" },
  { value: "unknown", label: "I don't know" },
];
const INTENSITIES = [
  { value: "immersive", label: "Immersive", meta: "Many small touchpoints during the day" },
  { value: "normal", label: "Normal", meta: "A few well-timed nudges" },
  { value: "low", label: "Low", meta: "Rare, only the essentials" },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [goals, setGoals] = useState<string[]>(["Business calls and meetings"]);
  const [level, setLevel] = useState("A2");
  const [context, setContext] = useState("");
  const [intensity, setIntensity] = useState("immersive");
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
      body: JSON.stringify({ name: name || "Friend", level, goals: goals.length ? goals : ["Business calls and meetings"], professionalContext: context, notificationIntensity: intensity, timezone }),
    });
    setLoading(false);
    if (!response.ok) return router.push("/login");
    router.push("/home");
    router.refresh();
  }

  return (
    <main className="shell authWrap">
      <section className="authCard">
        <div className="brand">English Buddy</div>
        {step === 0 && (
          <>
            <div className="hero"><div className="kicker">Step 1 of 3</div><h1>Make it yours.</h1><p className="muted">What should I call you, and what do you want English for?</p></div>
            <input className="field" placeholder="First name" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="pillGroup">
              {GOAL_OPTIONS.map((goal) => (
                <button key={goal} type="button" className={`pill ${goals.includes(goal) ? "pillActive" : ""}`} onClick={() => toggleGoal(goal)}>{goal}</button>
              ))}
            </div>
            <button className="primary full" onClick={() => setStep(1)}>Continue</button>
          </>
        )}
        {step === 1 && (
          <>
            <div className="hero"><div className="kicker">Step 2 of 3</div><h1>Where are you now?</h1><p className="muted">A rough guess is enough — I adjust from real conversations.</p></div>
            <select className="field" value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
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
            <button className="primary full" disabled={loading} onClick={save}>{loading ? "Saving…" : "Start"}</button>
          </>
        )}
      </section>
    </main>
  );
}

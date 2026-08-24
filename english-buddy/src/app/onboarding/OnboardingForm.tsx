"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const GOAL_OPTIONS = ["Riunioni e call", "Finanza e investimenti", "Presentazioni", "Trattative", "Viaggi", "Conversazione di tutti i giorni"];
const STARTING_LEVELS = [
  { value: "zero", label: "Parto da zero", meta: "Conosco pochissimo inglese e ho bisogno di un percorso guidato." },
  { value: "basics", label: "Capisco qualcosa", meta: "Riconosco un po' di inglese, ma faccio fatica a parlare." },
  { value: "independent", label: "Me la cavo", meta: "Riesco a comunicare, ma voglio essere più sciolto e sicuro." },
  { value: "business", label: "Ho già una base", meta: "Voglio concentrarmi su riunioni, call, finanza e situazioni professionali." },
];
const INTENSITIES = [
  { value: "immersive", label: "Tanto", meta: "Tanti piccoli momenti durante la giornata" },
  { value: "normal", label: "Il giusto", meta: "Qualche promemoria ben piazzato" },
  { value: "low", label: "Poco", meta: "Rari, solo l'essenziale" },
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
        name: name || "Amico",
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
            <div className="hero"><div className="kicker">Domanda 1 di 3</div><h1>Da dove parti?</h1><p className="muted">Scegli la riga più vicina a te: poi mi calibro sulle conversazioni vere.</p></div>
            {STARTING_LEVELS.map((option) => (
              <button key={option.value} type="button" className={`optionRow ${startingLevel === option.value ? "optionActive" : ""}`} onClick={() => setStartingLevel(option.value)}>
                <strong>{option.label}</strong>
                <span className="muted">{option.meta}</span>
              </button>
            ))}
            <button className="primary full" style={{ marginTop: 10 }} disabled={!startingLevel} onClick={() => setStep(1)}>Avanti</button>
          </>
        )}
        {step === 1 && (
          <>
            <div className="hero"><div className="kicker">Domanda 2 di 3</div><h1>Come ti chiamo?</h1><p className="muted">E a cosa ti serve l&rsquo;inglese.</p></div>
            <input className="field" placeholder="Il tuo nome" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="pillGroup">
              {GOAL_OPTIONS.map((goal) => (
                <button key={goal} type="button" className={`pill ${goals.includes(goal) ? "pillActive" : ""}`} onClick={() => toggleGoal(goal)}>{goal}</button>
              ))}
            </div>
            <textarea className="field" rows={3} placeholder="Di cosa ti occupi (facoltativo) — es. gestisco una holding, valuto acquisizioni, parlo con banche e investitori" value={context} onChange={(e) => setContext(e.target.value)} />
            <button className="primary full" onClick={() => setStep(2)}>Avanti</button>
          </>
        )}
        {step === 2 && (
          <>
            <div className="hero"><div className="kicker">Domanda 3 di 3</div><h1>Quanto devo farmi sentire?</h1><p className="muted">Lo cambi quando vuoi. Nessuna serie da non interrompere, nessun senso di colpa.</p></div>
            {INTENSITIES.map((option) => (
              <button key={option.value} type="button" className={`optionRow ${intensity === option.value ? "optionActive" : ""}`} onClick={() => setIntensity(option.value)}>
                <strong>{option.label}</strong>
                <span className="muted">{option.meta}</span>
              </button>
            ))}
            <div className="notice" style={{ margin: "6px 0 10px" }}>
              🎯 <strong>Seguimi e in 3 mesi sei operativo in inglese</strong>: riunioni, call, trasferte. Bastano pochi minuti al giorno — al ritmo ci penso io.
            </div>
            <button className="primary full" disabled={loading} onClick={save}>{loading ? "Salvo…" : "Comincia"}</button>
          </>
        )}
      </section>
    </main>
  );
}

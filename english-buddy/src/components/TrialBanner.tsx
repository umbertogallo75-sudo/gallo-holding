import { hoursLeft, type Trial } from "@/lib/marketing/trial";

/**
 * The free trial, made visible.
 *
 * A countdown nobody can see is not an offer, it is a surprise ending — and
 * the second day has to be earned by doing something specific, so the two
 * things it takes are named here rather than only in an email that may never
 * have been opened.
 */
export function TrialBanner({ trial, onboarded, minutes }: { trial: Trial; onboarded: boolean; minutes: number }) {
  if (!trial.active) return null;
  const hours = hoursLeft(trial);

  if (trial.extended) {
    return (
      <section className="trialBanner">
        <div className="trialTop"><span className="trialTag">🎁 Regalo sbloccato</span><strong className="trialClock">{hours}h</strong></div>
        <p className="trialLine">Hai completato il percorso: queste sono le tue <strong>24 ore extra</strong>, tutte aperte.</p>
        <p className="trialNote">Poi l&rsquo;accesso si chiude — nessun addebito automatico, deciderai tu.</p>
      </section>
    );
  }

  const missingMinutes = Math.max(0, 10 - minutes);
  const todo: string[] = [];
  if (!onboarded) todo.push("rispondi alle 3 domande");
  if (missingMinutes > 0) todo.push(`allenati ${missingMinutes} minut${missingMinutes === 1 ? "o" : "i"}`);

  return (
    <section className="trialBanner">
      <div className="trialTop"><span className="trialTag">Prova gratuita</span><strong className="trialClock">{hours}h</strong></div>
      {todo.length ? (
        <>
          <p className="trialLine">Ti restano <strong>{hours} ore</strong> con tutto aperto. Per averne <strong>altre 24 gratis</strong>: {todo.join(" e ")}.</p>
          <div className="pathBar" aria-hidden><span style={{ width: `${Math.round((Math.min(minutes, 10) / 10) * 100)}%` }} /></div>
        </>
      ) : (
        <p className="trialLine">✅ Percorso completato: le tue <strong>24 ore extra</strong> stanno arrivando.</p>
      )}
    </section>
  );
}

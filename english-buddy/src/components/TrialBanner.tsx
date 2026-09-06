import Link from "next/link";
import { daysLeft, type Trial } from "@/lib/marketing/trial";

/**
 * The free week, made visible.
 *
 * A countdown nobody can see is not an offer, it is a surprise ending. It says
 * the same thing all week and changes tone only at the end, where the useful
 * sentence is not "buy now" but "what you have built stays where it is" —
 * because the thing people are actually afraid of losing is the work, not the
 * access.
 */
const DAY = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });

export function TrialBanner({ trial }: { trial: Trial }) {
  if (!trial.active) return null;
  const days = daysLeft(trial);
  const closing = days <= 2;

  return (
    <section className="trialBanner">
      <div className="trialTop">
        <span className="trialTag">{closing ? "⏳ Ultimi giorni" : "🎁 La tua settimana gratis"}</span>
        <strong className="trialClock">{days} {days === 1 ? "giorno" : "giorni"}</strong>
      </div>
      {closing ? (
        <>
          <p className="trialLine">
            La settimana gratis finisce il <strong>{DAY.format(trial.endsAt)}</strong>.{" "}
            <strong>I tuoi progressi restano dove sono</strong>: livello, frasario ed errori su cui stai lavorando
            ti aspettano, e riprendi da lì quando vuoi.
          </p>
          <p className="trialNote">
            Nessun addebito automatico: quando scade, l&rsquo;accesso si chiude e basta.{" "}
            <Link href="/abbonamento" style={{ fontWeight: 700 }}>Guarda i piani →</Link>
          </p>
        </>
      ) : (
        <>
          <p className="trialLine">
            Hai <strong>tutto aperto</strong> fino al <strong>{DAY.format(trial.endsAt)}</strong>: chat e voce con Sam,
            riunioni simulate, mail, documenti, agenda.
          </p>
          <p className="trialNote">Nessuna carta inserita, nessun rinnovo automatico.</p>
        </>
      )}
    </section>
  );
}

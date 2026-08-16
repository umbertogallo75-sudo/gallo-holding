import Link from "next/link";
import { LandingTracker } from "@/app/LandingTracker";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Inglese per il lavoro — il coach AI che ti prepara alla riunione | ExecLingo",
  description:
    "Sai l'inglese ma nelle riunioni ti blocchi? ExecLingo ti dà le frasi pronte prima della call, ti regge durante e impara con te dopo. Test del livello gratis, senza carta.",
};

/**
 * Campaign landing page: the destination for paid traffic.
 *
 * Deliberately different from the home page and from /scarica. /scarica
 * teaches someone who already decided how to install; the home page talks to
 * a visitor who arrived on purpose. This one has fifteen seconds with a
 * stranger who clicked an ad, so it carries no navigation and no store links:
 * every exit that is not the call to action is a visitor already paid for and
 * then lost — and a purchase made inside a store costs 15% instead of 3% and
 * cannot be tied back to the click that produced it.
 */
export default function InglesePerLavoroPage() {
  const cta = "/register";
  return (
    <main className="lp">
      <LandingTracker page="inglese-lavoro" />

      <div className="lpTop">
        <div className="brand">ExecLingo</div>
      </div>

      <section className="lpHero">
        <h1 className="lpH1">Sai l&rsquo;inglese.<br />Ma <em>giovedì</em> hai una call, e la frase giusta ti arriva venti secondi dopo.</h1>
        <p className="lpLead">
          ExecLingo è un coach di inglese con intelligenza artificiale per manager, imprenditori e professionisti.
          Non parte da un programma: parte dalla tua agenda.
        </p>
        <div className="lpCtaWrap">
          <Link href={cta} className="lpCta" data-track="landing_cta_register">Fai il test del livello — 3 minuti, gratis</Link>
          <p className="lpUnder">Non serve la carta di credito. Funziona da telefono e da computer.</p>
        </div>
      </section>

      <section className="lpSection">
        <h2 className="lpH2">Il problema non è il vocabolario</h2>
        <p style={{ color: "var(--muted)", fontSize: 15.5, lineHeight: 1.6 }}>
          Hai studiato inglese per anni e capisci tutto. Poi entri in una riunione con tre persone che parlano veloce
          e hai due secondi per dire la cosa giusta — così dici qualcosa di più semplice di quello che pensi,
          e chi ascolta sente una persona più semplice di quella che sei.
        </p>
        <p style={{ color: "var(--muted)", fontSize: 15.5, lineHeight: 1.6, marginBottom: 0 }}>
          I corsi serali si saltano alla terza riunione fuori orario. Le app di lingue ti insegnano a ordinare al
          ristorante mentre tu domani hai una call su un ritardo di consegna.
        </p>
      </section>

      <section className="lpSection">
        <h2 className="lpH2">Prima ti preparo. Durante ti reggo. Dopo imparo con te.</h2>
        <div>
          <div className="lpStep">
            <div className="lpStepK">Prima</div>
            <div>
              <h3>La scheda per quella riunione</h3>
              <p>Scrivi una riga — «call col fornitore tedesco sul ritardo» — e in pochi secondi hai le frasi da avere pronte, le domande che ti faranno e come impostare la risposta.</p>
            </div>
          </div>
          <div className="lpStep">
            <div className="lpStepK">Durante</div>
            <div>
              <h3>Modalità Riunione</h3>
              <p>Il telefono accanto al portatile. Quattro appigli per quando ti blocchi e il «come si dice» istantaneo, senza uscire dalla call.</p>
            </div>
          </div>
          <div className="lpStep">
            <div className="lpStepK">Dopo</div>
            <div>
              <h3>Il debrief</h3>
              <p>La sera ti chiede com&rsquo;è andata e cosa non sei riuscito a dire. Quelle lacune diventano il materiale della settimana dopo. Nessun corso ti chiede mai com&rsquo;è andata.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="lpSection">
        <h2 className="lpH2">E ogni giorno, Sam</h2>
        <p style={{ color: "var(--muted)", fontSize: 15.5, lineHeight: 1.6, marginBottom: 0 }}>
          Sam è il coach. Ci parli o ci scrivi pochi minuti al giorno, anche a voce in tempo reale.
          Ricorda i tuoi errori e le espressioni che hai imparato e te li ripropone quando serve fissarli.
          Ed è lui a scriverti durante la giornata, nei ritagli veri: prima di una call, in aeroporto, fra due riunioni.
        </p>
      </section>

      <div className="lpCtaWrap">
        <Link href={cta} className="lpCta" data-track="landing_cta_register">Prova Sam adesso — il test è gratis</Link>
        <p className="lpUnder">3 minuti di conversazione, nessun voto, nessuna carta.</p>
      </div>

      <section className="lpSection">
        <h2 className="lpH2">Quanto costa</h2>
        <div className="lpPlans">
          <div className="lpPlan">
            <div><b>Programma 3 mesi</b><br /><span>Il percorso completo, circa €33 al mese</span></div>
            <div className="lpAmt">€99,90</div>
          </div>
          <div className="lpPlan">
            <div><b>Mensile</b><br /><span>Senza vincoli, si disdice quando vuoi</span></div>
            <div className="lpAmt">€39,90</div>
          </div>
          <div className="lpPlan">
            <div><b>Mantenimento</b><br /><span>Dopo il programma, per non perdere quello che hai preso</span></div>
            <div className="lpAmt">€29,90</div>
          </div>
        </div>
        <p className="lpUnder" style={{ textAlign: "left", marginTop: 12 }}>
          Prezzi IVA inclusa. Il test del livello è gratuito e non richiede pagamento.
          Per le <Link href="/aziende">licenze aziendali</Link> il prezzo è a volume.
        </p>
      </section>

      <section className="lpSection lpQ">
        <h2 className="lpH2">Le tre domande che ci fanno sempre</h2>

        <h3>«Non ho tempo.»</h3>
        <p>È il motivo per cui esiste. Le sessioni durano due o tre minuti e si fanno nei ritagli. Non c&rsquo;è un orario da rispettare e non c&rsquo;è niente da recuperare se salti un giorno.</p>

        <h3>«Ho già provato le app di lingue e le ho abbandonate.»</h3>
        <p>Anche noi. Falliscono perché ti danno un programma scolastico e una serie da non interrompere. Qui il motivo per aprire l&rsquo;app non è il dovere: è la riunione che hai davvero in calendario.</p>

        <h3>«Il mio livello è basso / troppo alto.»</h3>
        <p>Il test iniziale di 3 minuti serve esattamente a questo. Da lì in poi Sam si adatta: stessa app, contenuti diversi.</p>
      </section>

      <section className="lpSection">
        <h2 className="lpH2">È un prodotto vero, già in funzione</h2>
        <p style={{ color: "var(--muted)", fontSize: 15.5, lineHeight: 1.6, marginBottom: 0 }}>
          ExecLingo è pubblicato sull&rsquo;App Store ed è disponibile da browser su qualsiasi telefono e computer.
          È sviluppato in Italia da <strong>VASP ITALIA SRL</strong>. Dopo il test potrai installarlo sul telefono in dieci secondi.
        </p>
      </section>

      <div className="lpCtaWrap" style={{ marginTop: 34 }}>
        <Link href={cta} className="lpCta" data-track="landing_cta_register">Comincia dal test — 3 minuti, gratis</Link>
        <p className="lpUnder">Senza carta di credito. Puoi smettere quando vuoi.</p>
      </div>

      <p className="lpFoot">
        ExecLingo · un servizio VASP ITALIA SRL · Via M. Schipa 22/25, 80122 Napoli · P.IVA 03463400634<br />
        <Link href="/privacy">Privacy</Link> · <Link href="/cookie">Cookie</Link> · <Link href="/termini">Termini</Link> · <Link href="/login">Ho già un account</Link>
      </p>
    </main>
  );
}

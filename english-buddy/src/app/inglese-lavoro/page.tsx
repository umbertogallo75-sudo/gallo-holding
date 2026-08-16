import Link from "next/link";
import { LandingTracker } from "@/app/LandingTracker";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Inglese per il lavoro — il coach AI che parte anche da zero | ExecLingo",
  description:
    "L'inglese l'hai fatto a scuola tanti anni fa e oggi ti serve per lavoro? ExecLingo è un coach con intelligenza artificiale che parte dal punto in cui sei — anche da zero — e ti porta a riunioni, call e trasferte in tre mesi. Scarica l'app o fai il test gratis.",
};

/**
 * Campaign landing page: the destination for paid traffic.
 *
 * Two decisions are worth writing down, because both cost something.
 *
 * The page carries no navigation: fifteen seconds with a stranger who clicked
 * an ad, and every exit that is not a call to action is a visitor already paid
 * for and then lost.
 *
 * It does carry store buttons at the top, which is the opposite of what this
 * file did before. The cost is real and it is twofold: a purchase made inside
 * a store costs 15% instead of 3%, and it happens inside Apple's sheet, out of
 * reach of any campaign parameter — so Google Ads can never be told which
 * click produced it. That is an accepted trade, because the campaign is
 * sponsoring the download itself; the store clicks are tracked here
 * (landing_store_ios / landing_store_android, carrying the source) so at least
 * the near half of the funnel stays readable in our own analytics.
 *
 * The page speaks to two people at once. One knows English and freezes in
 * meetings; the other last used it at school twenty years ago. The second is
 * why "Da che punto parti?" sits high up, mirroring the real onboarding
 * question — a beginner needs to see themselves on the page before they will
 * believe the product is not another course they will abandon.
 */

/** Store buttons. Android becomes a Play link by itself once PLAY_STORE_URL exists. */
function StoreButtons({ where }: { where: "top" | "bottom" }) {
  const appStore = process.env.APP_STORE_URL || "/app";
  const playStore = process.env.PLAY_STORE_URL;
  return (
    <div className="lpStores">
      <a
        href={appStore}
        className="lpStore"
        data-track="landing_store_ios"
        data-where={where}
        aria-label="Scarica ExecLingo su App Store per iPhone e iPad"
      >
        <span className="lpStoreIcon" aria-hidden="true"></span>
        <span>
          <b>Scarica su App Store</b>
          <span>iPhone e iPad · gratis</span>
        </span>
      </a>
      <a
        href={playStore || "/scarica"}
        className="lpStore"
        data-track="landing_store_android"
        data-where={where}
        aria-label={playStore ? "Scarica ExecLingo su Google Play per Android" : "Installa ExecLingo su Android"}
      >
        <span className="lpStoreIcon" aria-hidden="true">▶</span>
        <span>
          <b>{playStore ? "Scarica su Google Play" : "Android — installa ora"}</b>
          <span>{playStore ? "Android · gratis" : "In 10 secondi dal browser · su Play a breve"}</span>
        </span>
      </a>
    </div>
  );
}

export default function InglesePerLavoroPage() {
  const cta = "/register";
  return (
    <main className="lp">
      <LandingTracker page="inglese-lavoro" />

      <div className="lpTop">
        <div className="brand">ExecLingo</div>
      </div>

      <section className="lpHero">
        <h1 className="lpH1">
          L&rsquo;inglese che ti serve al lavoro.<br />
          Anche se l&rsquo;ultima volta era <em>a scuola</em>.
        </h1>
        <p className="lpLead">
          ExecLingo è un coach di inglese con intelligenza artificiale. Parte dal punto in cui sei davvero
          — anche da zero — e lavora solo sull&rsquo;inglese che usi: riunioni, telefonate, clienti, trasferte.
          Pochi minuti al giorno, quando puoi tu.
        </p>

        <StoreButtons where="top" />
        <p className="lpUnder" style={{ textAlign: "left", marginTop: 10 }}>
          Scarichi e cominci subito, senza test e senza carta di credito. Funziona anche da browser, su qualsiasi computer.
        </p>

        <div className="lpCtaWrap">
          <Link href={cta} className="lpCta" data-track="landing_cta_register">
            Oppure fai il test del livello — 3 minuti, gratis
          </Link>
          <p className="lpUnder">Nessun voto e nessun esame: è una chiacchierata, serve solo a capire da dove partire.</p>
        </div>
      </section>

      <section className="lpSection">
        <h2 className="lpH2">Da che punto parti?</h2>
        <p style={{ color: "var(--muted)", fontSize: 15.5, lineHeight: 1.6, marginTop: 0 }}>
          È la prima domanda che ti fa l&rsquo;app, ed è una domanda vera: la risposta cambia subito il modo
          in cui Sam ti parla. Trova la riga che ti somiglia.
        </p>
        <div className="lpLevels">
          <div className="lpLevel" data-hi="1">
            <div className="lpLevelN">1</div>
            <div>
              <h3>«Parto da zero»</h3>
              <p>
                Conosci pochissime parole e non hai mai fatto una frase intera. Sam passa in modalità guidata:
                una struttura per volta, l&rsquo;italiano sotto ogni frase inglese, e mai una domanda a cui non
                puoi rispondere.
              </p>
            </div>
          </div>
          <div className="lpLevel">
            <div className="lpLevelN">2</div>
            <div>
              <h3>«Capisco qualcosa»</h3>
              <p>
                L&rsquo;inglese scritto lo leggi, ma parlare è un&rsquo;altra cosa. Si lavora sul produrre frasi tue,
                con l&rsquo;italiano ancora a fianco finché serve — e poi si toglie.
              </p>
            </div>
          </div>
          <div className="lpLevel">
            <div className="lpLevelN">3</div>
            <div>
              <h3>«Me la cavo»</h3>
              <p>
                Ti fai capire, ma sei lento e ti manca la parola giusta al momento giusto. Qui si sale di ritmo:
                conversazione vera, correzioni mirate, meno appoggi.
              </p>
            </div>
          </div>
          <div className="lpLevel">
            <div className="lpLevelN">4</div>
            <div>
              <h3>«Ho già una base, mi serve quello professionale»</h3>
              <p>
                Parli, ma non con la lingua della stanza in cui devi stare: numeri, margini, trattative,
                banche, investitori. Si va diretti lì.
              </p>
            </div>
          </div>
        </div>
        <p className="lpUnder" style={{ textAlign: "left" }}>
          Qualunque riga tu scelga, la destinazione è la stessa. Cambia il metodo, non l&rsquo;obiettivo.
        </p>
      </section>

      <section className="lpSection">
        <h2 className="lpH2">Se l&rsquo;inglese l&rsquo;hai fatto solo a scuola, tanti anni fa</h2>
        <p style={{ color: "var(--muted)", fontSize: 15.5, lineHeight: 1.6 }}>
          È il caso più comune che vediamo, ed è quello per cui abbiamo scritto la modalità guidata.
          Se scegli «parto da zero» cambiano tre cose, dalla prima sessione:
        </p>
        <div>
          <div className="lpStep">
            <div className="lpStepK">1</div>
            <div>
              <h3>Sam ti scrive anche in italiano</h3>
              <p>
                Sotto ogni frase inglese trovi cosa vuol dire. Non resti mai fermo davanti a una riga che non capisci.
                Man mano che ci prendi la mano l&rsquo;italiano si riduce da solo: l&rsquo;obiettivo è che tu non ne abbia più bisogno.
              </p>
            </div>
          </div>
          <div className="lpStep">
            <div className="lpStepK">2</div>
            <div>
              <h3>Una struttura per volta, mai il foglio bianco</h3>
              <p>
                Una sessione da tre minuti lavora su una sola frase utile — «My name is… I work in…»,
                «Could you repeat that?», «The meeting starts at…» — e te la fa riempire con i tuoi dati veri,
                non con quelli di un esercizio. Alla fine di quei tre minuti hai una frase che sai dire davvero.
              </p>
            </div>
          </div>
          <div className="lpStep">
            <div className="lpStepK">3</div>
            <div>
              <h3>Nessuno ti sente</h3>
              <p>
                La vergogna di parlare male davanti a qualcuno è il motivo numero uno per cui si smette.
                Qui non c&rsquo;è nessuno: puoi fare tutto scrivendo, e ascoltare la pronuncia quando vuoi
                toccando l&rsquo;altoparlante. La voce la usi quando ti va, non è mai obbligatoria.
              </p>
            </div>
          </div>
        </div>
        <p className="lpNote">
          Non ci sono lezioni da seguire a un orario, non c&rsquo;è niente da recuperare se salti un giorno e non
          esiste una serie da non interrompere. Se salti, riprendi. È fatto per chi lavora.
        </p>
      </section>

      <section className="lpSection">
        <h2 className="lpH2">Cosa saprai fare, e quando</h2>
        <p style={{ color: "var(--muted)", fontSize: 15.5, lineHeight: 1.6 }}>
          Il percorso è di tre mesi e non è misurato in lezioni fatte o in punteggi: è misurato in cose che
          sai fare. Sam le spunta solo quando le fai davvero in conversazione, non quando leggi la spiegazione.
        </p>
        <div className="lpMonths">
          <div className="lpMonth">
            <div className="lpMonthK">Mese 1 · le fondamenta</div>
            <ul className="lpCaps">
              <li>Presentarti: nome, lavoro, azienda</li>
              <li>Chiedere di ripetere o di parlare più piano</li>
              <li>Capire numeri, date e prezzi</li>
              <li>Cavartela in aeroporto, taxi e hotel</li>
              <li>Ordinare al ristorante e chiedere il conto</li>
              <li>Due chiacchiere prima di una riunione</li>
            </ul>
          </div>
          <div className="lpMonth">
            <div className="lpMonthK">Mese 2 · il lavoro</div>
            <ul className="lpCaps">
              <li>Spiegare la tua azienda e il tuo ruolo</li>
              <li>Descrivere un problema e il suo impatto</li>
              <li>Dare un&rsquo;opinione, dire sì e dire no</li>
              <li>Partecipare a una riunione semplice</li>
              <li>Proporre e fissare un appuntamento</li>
            </ul>
          </div>
          <div className="lpMonth">
            <div className="lpMonthK">Mese 3 · la stanza che conta</div>
            <ul className="lpCaps">
              <li>Gestire una telefonata di lavoro</li>
              <li>Presentare fatturato, margini e risultati</li>
              <li>Negoziare i punti chiave di un accordo</li>
              <li>Parlare con banche e investitori</li>
            </ul>
          </div>
        </div>
        <p className="lpUnder" style={{ textAlign: "left" }}>
          Tre mesi partendo da zero non fanno di te un madrelingua, e non te lo raccontiamo.
          Ti mettono in condizione di stare in quelle situazioni senza subirle.
        </p>
      </section>

      <div className="lpCtaWrap">
        <Link href={cta} className="lpCta" data-track="landing_cta_register">Comincia adesso — il test è gratis</Link>
        <p className="lpUnder">3 minuti di conversazione, nessun voto, nessuna carta di credito.</p>
      </div>

      <section className="lpSection">
        <h2 className="lpH2">E se invece l&rsquo;inglese lo sai già</h2>
        <p style={{ color: "var(--muted)", fontSize: 15.5, lineHeight: 1.6 }}>
          Allora il tuo problema è un altro, e lo conosciamo: entri in una riunione con tre persone che parlano
          veloce, hai due secondi per dire la cosa giusta, e dici qualcosa di più semplice di quello che pensi.
          Chi ascolta sente una persona più semplice di quella che sei. La frase giusta ti arriva venti secondi dopo.
        </p>
        <div>
          <div className="lpStep">
            <div className="lpStepK">Prima</div>
            <div>
              <h3>La scheda per quella riunione</h3>
              <p>
                Scrivi una riga — «call col fornitore tedesco sul ritardo» — e in pochi secondi hai le frasi da
                avere pronte, le domande che ti faranno e come impostare la risposta.
              </p>
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
              <p>
                La sera ti chiede com&rsquo;è andata e cosa non sei riuscito a dire. Quelle lacune diventano il
                materiale della settimana dopo. Nessun corso ti chiede mai com&rsquo;è andata.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="lpSection">
        <h2 className="lpH2">Come sono fatte le giornate</h2>
        <p style={{ color: "var(--muted)", fontSize: 15.5, lineHeight: 1.6 }}>
          Sam è il coach. Ci scrivi o ci parli pochi minuti al giorno, ed è lui a farsi vivo nei ritagli veri:
          prima di una call, in aeroporto, fra due riunioni. Ricorda i tuoi errori e le espressioni che hai
          imparato, e te li ripropone quando è il momento di fissarli.
        </p>
        <div className="lpModes">
          <div className="lpMode"><b>Due minuti</b><span>Una domanda, una risposta. Il minimo che tiene viva l&rsquo;abitudine.</span></div>
          <div className="lpMode"><b>Prima di una call</b><span>Le 6-8 frasi per quella riunione lì, e le prove delle risposte.</span></div>
          <div className="lpMode"><b>Ascolto</b><span>Una frase alla volta da sentire e scrivere. Si parte corti.</span></div>
          <div className="lpMode"><b>Pronuncia</b><span>Ripeti dietro a Sam. Anche solo sussurrando, funziona.</span></div>
          <div className="lpMode"><b>Vita reale</b><span>Aeroporto, hotel, ristorante, taxi. Recitati fino a che escono da soli.</span></div>
          <div className="lpMode"><b>Ripasso</b><span>Solo quello che stai per dimenticare, nel giorno giusto.</span></div>
        </div>
      </section>

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
          Prezzi IVA inclusa. Scaricare l&rsquo;app e fare il test del livello è gratuito e non richiede pagamento.
          Per le <Link href="/aziende">licenze aziendali</Link> il prezzo è a volume.
        </p>
      </section>

      <section className="lpSection lpQ">
        <h2 className="lpH2">Le domande che ci fanno sempre</h2>

        <h3>«Parto da zero, non è troppo tardi?»</h3>
        <p>
          No, ed è il motivo per cui esiste la modalità guidata. Quello che rende difficile ricominciare da adulti
          non è l&rsquo;età: è che i corsi ripartono dalla grammatica e tu molli alla terza settimana. Qui la prima
          sessione ti fa già dire una frase che userai.
        </p>

        <h3>«Non ho tempo.»</h3>
        <p>
          È il motivo per cui esiste. Le sessioni durano due o tre minuti e si fanno nei ritagli.
          Non c&rsquo;è un orario da rispettare e non c&rsquo;è niente da recuperare se salti un giorno.
        </p>

        <h3>«Mi vergogno a parlare male.»</h3>
        <p>
          Non ti sente nessuno. Puoi fare tutto scrivendo e non usare mai il microfono: l&rsquo;app è pensata per
          chi spesso è in ufficio, in treno o in riunione e non può parlare. La voce è un&rsquo;opzione, non un requisito.
        </p>

        <h3>«Ho già provato le app di lingue e le ho abbandonate.»</h3>
        <p>
          Anche noi. Falliscono perché ti danno un programma scolastico e una serie da non interrompere.
          Qui il motivo per aprire l&rsquo;app non è il dovere: è la riunione che hai davvero in calendario.
        </p>

        <h3>«Devo per forza fare il test per usarla?»</h3>
        <p>
          No. Puoi scaricare l&rsquo;app dai pulsanti qui sopra e cominciare. Il test di tre minuti serve solo a
          farti risparmiare tempo: senza, Sam impiega qualche sessione in più per capire il tuo livello.
        </p>
      </section>

      <section className="lpSection">
        <h2 className="lpH2">È un prodotto vero, già in funzione</h2>
        <p style={{ color: "var(--muted)", fontSize: 15.5, lineHeight: 1.6 }}>
          ExecLingo è pubblicato sull&rsquo;App Store e funziona da browser su qualsiasi telefono e computer.
          È sviluppato in Italia da <strong>VASP ITALIA SRL</strong>.
        </p>
        <StoreButtons where="bottom" />
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

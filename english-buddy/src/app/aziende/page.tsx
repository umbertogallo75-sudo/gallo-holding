import Link from "next/link";
import { isEmbeddedApp } from "@/lib/appclient";
import { SitePage } from "@/components/SitePage";
import { StoreBadges } from "@/components/StoreBadges";
import { TEAM_PLANS } from "@/lib/licenses";
import { CompanyForm } from "./CompanyForm";
import styles from "./aziende.module.css";

export const metadata = {
  title: "ExecLingo per aziende — inglese operativo come welfare aziendale",
  description:
    "Licenze team di inglese per il lavoro: programma 3 mesi o annuale, sconti volume da 10 licenze. Costo di formazione deducibile, welfare aziendale, fondi interprofessionali. Codici subito via email.",
  alternates: { canonical: "/aziende" },
};

const euro = (cents: number) => (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2 }) + " €";

/** The date the tax section was last checked, shown to the reader: rules move,
 * and a page that quotes them without a date is a page nobody can trust. */
const FISCAL_REVIEW = "settembre 2026";

const USES = [
  {
    title: "Welfare che si usa davvero",
    body: "Un benefit che entra nella giornata invece di restare in un catalogo: dieci minuti, dal telefono, con risultati che la persona vede su di sé.",
  },
  {
    title: "Team commerciali ed export",
    body: "Chi tratta, vende e segue clienti esteri si allena su call, prezzi, obiezioni e follow-up — non su esercizi di grammatica.",
  },
  {
    title: "Manager e riunioni internazionali",
    body: "Prendere la parola in un meeting, difendere un numero, chiudere un punto: le situazioni in cui l'inglese incerto costa di più.",
  },
  {
    title: "Onboarding e nuovi ruoli",
    body: "Chi entra o passa a un incarico con contatti esteri parte subito, senza aspettare che si formi un'aula.",
  },
  {
    title: "Sedi diverse, stessi contenuti",
    body: "Filiali, cantieri, negozi, turnisti: nessuna logistica d'aula, ognuno si allena quando può.",
  },
  {
    title: "Trattenere le persone",
    body: "Una competenza che resta alla persona è tra le ragioni per cui sceglie di restare. Costa meno di una sostituzione.",
  },
];

export default async function AziendePage({ searchParams }: { searchParams: Promise<{ esito?: string }> }) {
  const { esito } = await searchParams;

  // Store-app wrappers: reader-app mode — informational only, no purchase.
  if (await isEmbeddedApp()) {
    return (
      <main className="shell">
        <div className="topbar"><div className="brand">ExecLingo · Aziende</div><Link className="chip" href="/">← Indietro</Link></div>
        <section className="hero">
          <div className="kicker">ExecLingo per aziende</div>
          <h1>Il tuo team operativo in inglese.</h1>
          <p className="muted">Le aziende attivano licenze team per i propri dipendenti — programma di 3 mesi o annuale: ogni collega riceve un codice e attiva il percorso in un minuto dal proprio profilo.</p>
          <p className="itHint">Hai ricevuto un codice dalla tua azienda? Vai su Profilo → 💳 Abbonamento e inseriscilo lì.</p>
        </section>
      </main>
    );
  }

  return (
    <SitePage>
      <div className={styles.root}>
        {esito === "ok" ? (
          <section className="card" style={{ borderColor: "color-mix(in srgb, var(--accent) 55%, var(--line))" }}>
            <h2 style={{ marginTop: 0 }}>🎉 Ordine ricevuto!</h2>
            <p className="muted" style={{ margin: 0 }}>I codici licenza stanno arrivando all&rsquo;email del referente (controlla anche lo spam). Ogni collega attiva il suo in un minuto.</p>
          </section>
        ) : null}
        {esito === "annullato" ? (
          <section className="card"><p className="muted" style={{ margin: 0 }}>Pagamento annullato — nessun addebito.</p></section>
        ) : null}

        <header className={styles.hero}>
          <p className={styles.eyebrow}>ExecLingo per le imprese</p>
          <h1>L&rsquo;inglese del lavoro, come benefit che il team usa davvero.</h1>
          <p className={styles.lede}>
            Sam allena le situazioni in cui l&rsquo;inglese serve sul serio — riunioni, numeri, trattativa, trasferte — in sessioni brevi, dal telefono.
            L&rsquo;azienda acquista le licenze in un pagamento, i codici arrivano subito via email, ogni persona attiva la sua in un minuto.
            È formazione a tutti gli effetti: per l&rsquo;impresa è un costo deducibile, e può rientrare nel piano di welfare aziendale.
          </p>
          <div className={styles.facts}>
            <div className={styles.fact}><strong>10 min</strong><span>al giorno, dal telefono</span></div>
            <div className={styles.fact}><strong>1 minuto</strong><span>per attivare un codice</span></div>
            <div className={styles.fact}><strong>da 10</strong><span>licenze, self-service</span></div>
            <div className={styles.fact}><strong>iOS · Android · web</strong><span>nessuna installazione da gestire</span></div>
          </div>
        </header>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Come lo usano le imprese</h2>
            <p>Sei situazioni ricorrenti. Cambia il motivo per cui si compra, non il modo in cui si attiva.</p>
          </div>
          <div className={styles.uses}>
            {USES.map((use) => (
              <article key={use.title} className={styles.use}>
                <h3>{use.title}</h3>
                <p>{use.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.fiscal} id="fisco">
          <div className={styles.sectionHead}>
            <h2>Quanto costa davvero: le leve fiscali</h2>
            <p>
              Formare il personale in inglese non è una spesa qualsiasi. A seconda di come la inquadri, l&rsquo;impresa deduce, il dipendente non tassa,
              e in alcuni casi paga un fondo a cui stai già versando. Ecco le strade, con le condizioni vere di ciascuna.
            </p>
          </div>

          <div className={styles.levers}>
            <article className={styles.lever}>
              <p className={styles.who}>L&rsquo;impresa</p>
              <h3>Se serve per il lavoro, è un costo di formazione</h3>
              <p>
                Quando la formazione è inerente all&rsquo;attività — il commerciale che tratta in inglese, il tecnico che parla coi fornitori esteri —
                è un normale costo d&rsquo;esercizio, deducibile dal reddito d&rsquo;impresa secondo le regole ordinarie, con IVA detraibile.
                Per il dipendente non è un benefit e non fa reddito: è uno strumento di lavoro.
              </p>
              <p className={styles.norm}>È la strada più semplice, e quella in cui rientra la maggior parte degli acquisti aziendali.</p>
            </article>

            <article className={styles.lever}>
              <p className={styles.who}>Il dipendente</p>
              <h3>Come welfare, non concorre al suo reddito</h3>
              <p>
                Se invece lo offri come crescita personale, rientra tra le opere e i servizi con finalità di educazione e istruzione
                dell&rsquo;art. 51, comma 2, lett. f) del TUIR: non concorre a formare il reddito di lavoro dipendente e non consuma il tetto dei fringe benefit.
              </p>
              <p className={styles.norm}>
                Condizione: dev&rsquo;essere offerto alla generalità dei dipendenti o a una categoria omogenea — non alla singola persona scelta.
              </p>
            </article>

            <article className={styles.lever}>
              <p className={styles.who}>L&rsquo;impresa</p>
              <h3>Quanto deduci del welfare dipende da dove lo scrivi</h3>
              <p>
                Sul versante welfare l&rsquo;art. 100 del TUIR ammette la deduzione nel limite del 5 per mille del costo del lavoro se l&rsquo;offerta è volontaria,
                e per intero se discende da contratto collettivo, accordo o regolamento aziendale.
              </p>
              <p className={styles.norm}>Metterlo nel regolamento aziendale è spesso ciò che separa il 5‰ dal 100%.</p>
            </article>

            <article className={styles.lever}>
              <p className={styles.who}>Il dipendente</p>
              <h3>Premio di risultato convertito in welfare</h3>
              <p>
                Chi ha diritto a un premio di risultato può, dove la contrattazione lo prevede, convertirlo in servizi welfare:
                in quel caso il valore non sconta né l&rsquo;imposta sostitutiva né i contributi, e arriva alla persona per intero.
              </p>
              <p className={styles.norm}>Richiede un accordo di secondo livello che preveda la conversione.</p>
            </article>

            <article className={styles.lever}>
              <p className={styles.who}>Il professionista</p>
              <h3>Partita IVA: deducibile fino a 10.000 € l&rsquo;anno</h3>
              <p>
                Per chi produce reddito di lavoro autonomo, le spese di iscrizione a corsi di formazione e aggiornamento professionale
                sono integralmente deducibili entro il limite di 10.000 € annui previsto dal TUIR.
              </p>
              <p className={styles.norm}>
                Vale anche per il singolo professionista: si acquista con la propria partita IVA, indicandola al momento del pagamento.
              </p>
            </article>

            <article className={styles.lever}>
              <p className={styles.who}>Il fondo</p>
              <h3>Fondi interprofessionali: lo 0,30% che versi già</h3>
              <p>
                Ogni azienda con dipendenti versa all&rsquo;INPS un contributo dello 0,30% sulle retribuzioni. Aderendo a un fondo interprofessionale
                (Fondimpresa, For.Te., FonARCom, Fondirigenti, Fondoprofessioni, Fondartigianato e gli altri) quella quota torna disponibile per finanziare
                piani formativi aziendali. L&rsquo;adesione non costa nulla e la formazione linguistica è tra le più finanziate.
              </p>
              <p className={styles.norm}>Il fondo si sceglie in Uniemens; la quota accantonata resta a disposizione dell&rsquo;azienda.</p>
            </article>

            <p className={`${styles.caveat} ${styles.wide}`}>
              <strong>Su questo siamo diretti:</strong> i fondi finanziano piani con ore tracciate e rendicontate, e l&rsquo;autoapprendimento
              a distanza è ammesso entro limiti che cambiano da avviso ad avviso (su alcuni bandi Fondimpresa, ad esempio, non oltre il 10% delle ore del piano).
              ExecLingo funziona bene come componente quotidiana di un piano misto, accanto alle ore d&rsquo;aula o in aula virtuale — non come piano finanziato per intero.
              Se stai costruendo un piano, scrivici prima di acquistare.
            </p>
          </div>

          <p className={styles.disclaimer}>
            Informazioni di carattere generale aggiornate a {FISCAL_REVIEW}, fornite per orientare la valutazione: non costituiscono consulenza fiscale o del lavoro.
            L&rsquo;inquadramento corretto dipende dal CCNL applicato, dagli accordi e dal regolamento aziendale, e va verificato con il proprio consulente
            o consulente del lavoro prima di procedere.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Sconti volume</h2>
            <p>Lo stesso sconto su entrambi i pacchetti: cresce con il numero di licenze e si applica da solo al totale. Prezzi IVA inclusa, per licenza, una tantum.</p>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Licenze</th>
                  <th scope="col">Sconto</th>
                  <th scope="col">{TEAM_PLANS.program.label}<small>pieno {euro(TEAM_PLANS.program.full)}</small></th>
                  <th scope="col">{TEAM_PLANS.annual.label}<small>pieno {euro(TEAM_PLANS.annual.full)}</small></th>
                </tr>
              </thead>
              <tbody>
                {([["10 – 49", "−5%", 0], ["50 – 149", "−10%", 1], ["150 e oltre", "−15%", 2]] as const).map(([range, off, tier]) => (
                  <tr key={range}>
                    <th scope="row" style={{ fontWeight: 600 }}>{range}</th>
                    <td>{off}</td>
                    <td className={styles.price}>{euro(TEAM_PLANS.program.tiers[tier])}</td>
                    <td className={styles.price}>{euro(TEAM_PLANS.annual.tiers[tier])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="itHint" style={{ margin: 0 }}>
            Il <strong>{TEAM_PLANS.program.label}</strong> è il percorso completo da dove sei oggi a operativo; l&rsquo;<strong>{TEAM_PLANS.annual.label}</strong> tiene
            il team con Sam per dodici mesi. Sopra le 1.000 licenze, o per fatturazione dedicata: <strong>ug@vaspitalia.com</strong>
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}><h2>Come si attiva</h2></div>
          <div className={styles.steps}>
            <div className={styles.step}><span>1 · Acquisti</span><strong>N licenze in un pagamento</strong><p>Con carta, partita IVA inseribile al checkout.</p></div>
            <div className={styles.step}><span>2 · Ricevi</span><strong>N codici via email, subito</strong><p>Un elenco da conservare, uno per ogni persona.</p></div>
            <div className={styles.step}><span>3 · Distribuisci</span><strong>Un codice a ogni collega</strong><p>Via email interna, insieme alle tre righe di istruzioni.</p></div>
            <div className={styles.step}><span>4 · Attivano</span><strong>Registrazione e codice, 1 minuto</strong><p>Profilo → Abbonamento → codice aziendale. Fine.</p></div>
          </div>
        </section>

        <section className={styles.buy} id="acquista">
          <CompanyForm />
          <div style={{ display: "grid", gap: 14 }}>
            <div className={styles.contact}>
              <h2 style={{ margin: 0, fontSize: "1.0625rem" }}>Prima di decidere</h2>
              <p>
                Se devi presentarlo al CDA, al controllo di gestione o al consulente del lavoro, scrivici a <strong>ug@vaspitalia.com</strong>:
                prepariamo un preventivo intestato e rispondiamo alle domande di inquadramento.
              </p>
              <p>Ordini oltre le 1.000 licenze, gruppi con più società, fatturazione dedicata: stessa email.</p>
            </div>
            <div className={styles.contact}>
              <h2 style={{ margin: 0, fontSize: "1.0625rem" }}>Per ogni collega</h2>
              <p>Insieme al codice puoi condividere questi collegamenti: ognuno scarica ExecLingo dallo store ufficiale e accede col proprio account.</p>
              <StoreBadges where="aziende" compact />
            </div>
          </div>
        </section>

        <p className="itHint" style={{ margin: "0 4px 8px", textAlign: "center" }}>
          ExecLingo · un servizio VASP ITALIA SRL · <Link href="/termini">Termini</Link> · <Link href="/privacy">Privacy</Link>
        </p>
      </div>
    </SitePage>
  );
}

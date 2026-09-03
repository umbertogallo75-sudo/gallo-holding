import Link from "next/link";
import { ConsentReset } from "@/components/ConsentReset";
import { SitePage } from "@/components/SitePage";

export const metadata = { title: "Cookie policy · ExecLingo" };

/**
 * Cookie policy — the extended notice the banner links to.
 *
 * Kept as its own page, and written from the code rather than from a
 * template: every name and duration below is the value actually used in the
 * app. A notice that describes a different site than the one running is the
 * most common defect there is, and the easiest to get caught on.
 */
export default function CookiePage() {
  return (
    <SitePage>
      <section className="hero">
        <div className="kicker">Cookie policy</div>
        <h1>Quali cookie usiamo, uno per uno.</h1>
        <p className="muted">Ultimo aggiornamento: agosto 2026</p>
      </section>

      <section className="card">
        <h2>In breve</h2>
        <p>I cookie necessari a farti entrare, a ricordare da dove sei arrivato e a riconoscere chi ti ha segnalato sono <strong>nostri</strong>: restano nel nostro database e non ti seguono su altri siti.</p>
        <p>I cookie di <strong>terze parti</strong> — Google, Meta e LinkedIn, usati solo quando è attiva una campagna pubblicitaria — <strong>non vengono caricati finché non dici di sì</strong>. Se rifiuti, o se non rispondi al banner, non partono affatto e il sito funziona esattamente allo stesso modo.</p>
      </section>

      <section className="card">
        <h2>Cookie tecnici e di funzionamento</h2>
        <p className="muted">Servono a far funzionare il servizio che hai chiesto. Non richiedono consenso e non si possono disattivare senza rompere l&rsquo;accesso.</p>
        <div style={{ overflowX: "auto" }}>
          <table className="adminTable">
            <thead>
              <tr><th>Nome</th><th>A cosa serve</th><th>Durata</th></tr>
            </thead>
            <tbody>
              <tr><td><code>english_buddy_session</code></td><td>Ti tiene collegato al tuo account senza richiederti la password a ogni pagina.</td><td>90 giorni</td></tr>
              <tr><td><code>eb_src</code></td><td>Ricorda da quale canale sei arrivato la <strong>prima</strong> volta (es. LinkedIn, una ricerca, un annuncio), per capire quali canali funzionano. Contiene un identificativo casuale, non il tuo nome.</td><td>90 giorni</td></tr>
              <tr><td><code>eb_ref</code></td><td>Riconosce il partner che ti ha segnalato ExecLingo, così se ti abboni gli spetta la commissione.</td><td>30 giorni</td></tr>
              <tr><td><code>eb_consent</code></td><td>Ricorda la scelta che hai fatto su questa pagina, per non richiedertela a ogni visita. Contiene anche la ricevuta della tua scelta.</td><td>180 giorni</td></tr>
              <tr><td><code>eb_app</code></td><td>Riconosce che stai usando l&rsquo;app installata e non il sito nel browser, per mostrarti l&rsquo;interfaccia giusta.</td><td>365 giorni</td></tr>
            </tbody>
          </table>
        </div>
        <p className="itHint" style={{ marginBottom: 0 }}>Nella memoria del browser conserviamo anche <code>buddy-visitor-id</code>, un numero casuale che collega le tue visite fra loro senza dire chi sei. Si cancella svuotando i dati del sito.</p>
      </section>

      <section className="card">
        <h2>Cookie di terze parti — solo con il tuo consenso</h2>
        <p className="muted">Non vengono caricati prima che tu prema «Accetta». Servono a capire quali annunci portano persone davvero interessate, non a costruire un profilo di te per rivenderlo.</p>
        <div style={{ overflowX: "auto" }}>
          <table className="adminTable">
            <thead>
              <tr><th>Chi</th><th>Cookie tipici</th><th>A cosa serve</th><th>Durata</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Meta</strong><br /><span className="muted">Facebook, Instagram</span></td>
                <td><code>_fbp</code>, <code>_fbc</code></td>
                <td>Collegare una visita all&rsquo;annuncio che l&rsquo;ha generata.</td>
                <td>fino a 90 giorni</td>
              </tr>
              <tr>
                <td><strong>Google</strong><br /><span className="muted">Google Ads</span></td>
                <td><code>_gcl_au</code> e affini</td>
                <td>Attribuire un&rsquo;iscrizione o un acquisto alla campagna che l&rsquo;ha prodotto.</td>
                <td>fino a 90 giorni</td>
              </tr>
              <tr>
                <td><strong>Google</strong><br /><span className="muted">Google Analytics</span></td>
                <td><code>_ga</code>, <code>_ga_*</code></td>
                <td>Capire quante persone visitano il sito, da dove arrivano e quali pagine leggono, in forma aggregata.</td>
                <td>fino a 24 mesi</td>
              </tr>
              <tr>
                <td><strong>LinkedIn</strong><br /><span className="muted">Insight Tag</span></td>
                <td><code>li_fat_id</code>, <code>lms_analytics</code>, <code>AnalyticsSyncHistory</code>, <code>UserMatchHistory</code></td>
                <td>Misurare visite e conversioni, attribuirle alle campagne e creare pubblici di remarketing.</td>
                <td>fino a 30 giorni</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>Possono ricevere dati tecnici della visita, come URL, provenienza, indirizzo IP, caratteristiche del browser e data e ora. <strong>Non inviamo mai:</strong> il tuo nome, la tua email, le tue conversazioni con il coach o i tuoi dati di apprendimento. Per LinkedIn non è attiva la corrispondenza avanzata tramite email.</p>
        <p className="muted">Le informative dei fornitori: <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer">Meta</a> · <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google</a> · <a href="https://www.linkedin.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">LinkedIn</a>. Questi fornitori possono trattare dati fuori dall&rsquo;Unione Europea con le garanzie previste dal GDPR.</p>
      </section>

      <section className="card">
        <h2>Cambiare idea</h2>
        <p>Puoi revocare il consenso in qualsiasi momento, ed è facile quanto darlo: la revoca vale da subito e viene registrata.</p>
        <ConsentReset />
        <p className="itHint" style={{ marginBottom: 0, marginTop: 12 }}>Se qui sopra non compare nulla, significa che al momento non è attiva alcuna campagna pubblicitaria e nessun cookie di terze parti è presente sul sito.</p>
      </section>

      <section className="card">
        <h2>Bloccarli dal browser</h2>
        <p>Indipendentemente da questa pagina, puoi gestire o cancellare i cookie dalle impostazioni del tuo browser — di solito alla voce «Privacy e sicurezza». Tieni presente che bloccando anche i cookie tecnici l&rsquo;accesso al tuo account smetterà di funzionare.</p>
      </section>

      <section className="card">
        <h2>Chi è il titolare</h2>
        <p>Il titolare del trattamento è <strong>VASP ITALIA SRL</strong> — Via M. Schipa 22, 80122 Napoli — P.IVA 03463400634, PEC vasp@pec.it. Per qualsiasi richiesta scrivi a <a href="mailto:ug@vaspitalia.com">ug@vaspitalia.com</a>. Puoi presentare reclamo al Garante per la protezione dei dati personali (garanteprivacy.it).</p>
      </section>

      <p className="itHint" style={{ margin: "14px 4px 24px", textAlign: "center" }}>
        <Link href="/privacy">Informativa privacy</Link> · <Link href="/termini">Termini di servizio</Link> · <Link href="/">Torna all&rsquo;inizio</Link>
      </p>
    </SitePage>
  );
}

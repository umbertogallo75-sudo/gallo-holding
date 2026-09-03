import Link from "next/link";
import { SitePage } from "@/components/SitePage";

export const metadata = { title: "Elimina account · ExecLingo" };

/**
 * Account-deletion page required by Google Play's data-safety form (and
 * useful for everyone): public URL where users can request the deletion of
 * their ExecLingo account or of specific data.
 */
export default function EliminaAccountPage() {
  return (
    <SitePage>
      <section className="hero">
        <div className="kicker">Elimina account</div>
        <h1>Vuoi cancellare il tuo account ExecLingo?</h1>
        <p className="muted">Nessun vincolo: la richiesta basta, al resto pensiamo noi.</p>
      </section>

      <section className="card">
        <h2>Come richiedere l&rsquo;eliminazione</h2>
        <p>Scrivi una email a <a href="mailto:ug@vaspitalia.com?subject=Eliminazione%20account%20ExecLingo">ug@vaspitalia.com</a> con oggetto <strong>&ldquo;Eliminazione account ExecLingo&rdquo;</strong>, inviandola <strong>dall&rsquo;indirizzo email con cui ti sei registrato</strong> (ci serve per verificare che l&rsquo;account sia tuo). Non devi spiegare il motivo.</p>
        <p>Confermiamo la ricezione e completiamo l&rsquo;eliminazione <strong>entro 30 giorni</strong>.</p>
      </section>

      <section className="card">
        <h2>Cosa viene eliminato</h2>
        <p>Tutto ciò che è legato al tuo account: profilo (nome ed email), credenziali di accesso, conversazioni con il coach, progressi, espressioni salvate, iscrizioni alle notifiche. L&rsquo;eliminazione è definitiva e non reversibile.</p>
        <p><strong>Cosa può restare:</strong> la documentazione fiscale e i registri contabili relativi a eventuali acquisti, conservati per i tempi previsti dalla legge (di norma 10 anni). Se eri un partner, possono restare anche i dati strettamente necessari a documentare o saldare provvigioni e pagamenti; il profilo viene scollegato dall&rsquo;account e anonimizzato dove possibile. Se hai chiesto di non ricevere più email, conserviamo inoltre a tempo indeterminato un&rsquo;<strong>impronta pseudonimizzata SHA-256 dell&rsquo;indirizzo email</strong>, necessaria per rispettare la tua opposizione anche dopo la cancellazione. Non contiene l&rsquo;email in chiaro e non può essere usata da sola per contattarti, ma può essere confrontata con un indirizzo già noto: per questo la proteggiamo come dato personale pseudonimizzato. Tutti gli altri dati legati all&rsquo;account vengono eliminati.</p>
      </section>

      <section className="card">
        <h2>Vuoi eliminare solo alcuni dati?</h2>
        <p>Se preferisci mantenere l&rsquo;account ma cancellare dati specifici (per esempio le conversazioni con il coach o le registrazioni dei progressi), scrivi alla stessa email indicando cosa vuoi eliminare: procediamo allo stesso modo, entro 30 giorni.</p>
      </section>

      <section className="card">
        <h2>Abbonamenti</h2>
        <p>L&rsquo;eliminazione dell&rsquo;account non annulla da sola un piano ricorrente (Mensile, Annuale o Mantenimento). Se hai pagato sul sito, disdicilo prima dalla pagina Abbonamento. Su iPhone usa Impostazioni → il tuo nome → Abbonamenti; su Android usa Play Store → Pagamenti e abbonamenti → Abbonamenti.</p>
      </section>

      <p className="itHint" style={{ margin: "14px 4px 24px" }}>
        Titolare del trattamento: VASP ITALIA SRL · <Link href="/privacy">Privacy</Link> · <Link href="/termini">Termini</Link>
      </p>
    </SitePage>
  );
}

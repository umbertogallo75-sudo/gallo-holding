import Link from "next/link";

export const metadata = { title: "Elimina account · ExecLingo" };

/**
 * Account-deletion page required by Google Play's data-safety form (and
 * useful for everyone): public URL where users can request the deletion of
 * their ExecLingo account or of specific data.
 */
export default function EliminaAccountPage() {
  return (
    <main className="shell">
      <div className="topbar"><div className="brand">ExecLingo</div><Link className="chip" href="/">← Indietro</Link></div>
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
        <p><strong>Cosa può restare:</strong> i documenti fiscali relativi a eventuali acquisti (fatture e ricevute), che la legge ci obbliga a conservare per 10 anni, e nient&rsquo;altro.</p>
      </section>

      <section className="card">
        <h2>Vuoi eliminare solo alcuni dati?</h2>
        <p>Se preferisci mantenere l&rsquo;account ma cancellare dati specifici (per esempio le conversazioni con il coach o le registrazioni dei progressi), scrivi alla stessa email indicando cosa vuoi eliminare: procediamo allo stesso modo, entro 30 giorni.</p>
      </section>

      <section className="card">
        <h2>Abbonamenti</h2>
        <p>L&rsquo;eliminazione dell&rsquo;account non annulla da sola un abbonamento attivo: se hai un piano mensile, disdicilo prima (dal sito nella pagina Abbonamento, oppure — se hai acquistato tramite App Store — da Impostazioni → Abbonamenti sul tuo dispositivo).</p>
      </section>

      <p className="itHint" style={{ margin: "14px 4px 24px" }}>
        Titolare del trattamento: VASP ITALIA SRL · <Link href="/privacy">Privacy</Link> · <Link href="/termini">Termini</Link>
      </p>
    </main>
  );
}

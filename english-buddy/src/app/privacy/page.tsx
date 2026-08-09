import Link from "next/link";

export const metadata = { title: "Privacy · ExecLingo" };

/** Informativa privacy (GDPR) — public page, linked from landing and register. */
export default function PrivacyPage() {
  return (
    <main className="shell">
      <div className="topbar"><div className="brand">ExecLingo</div><Link className="chip" href="/">← Indietro</Link></div>
      <section className="hero">
        <div className="kicker">Informativa privacy</div>
        <h1>I tuoi dati, in chiaro.</h1>
        <p className="muted">Ultimo aggiornamento: agosto 2026</p>
      </section>

      <section className="card">
        <h2>Chi tratta i tuoi dati</h2>
        <p>Il titolare del trattamento è <strong>VASP ITALIA SRL</strong>. Per qualsiasi richiesta sui tuoi dati scrivi a <a href="mailto:umberto.gallo75@gmail.com">umberto.gallo75@gmail.com</a>.</p>
      </section>

      <section className="card">
        <h2>Quali dati raccogliamo</h2>
        <p><strong>Dati dell&rsquo;account:</strong> nome, email e codice personale di accesso (conservato solo in forma cifrata: nessuno può leggerlo, nemmeno noi).</p>
        <p><strong>Dati di apprendimento:</strong> le conversazioni con il coach, gli errori, le espressioni imparate e i progressi. Servono a personalizzare il tuo percorso — sono il cuore del servizio.</p>
        <p><strong>Notifiche:</strong> se le attivi, salviamo l&rsquo;iscrizione push del tuo dispositivo per poterti scrivere durante il giorno.</p>
        <p><strong>Statistiche d&rsquo;uso:</strong> eventi anonimi (es. visite alla pagina iniziale) raccolti nel nostro database. <strong>Non usiamo tracker di terze parti</strong> né cookie di profilazione: l&rsquo;unico cookie è quello tecnico di sessione che ti tiene collegato.</p>
      </section>

      <section className="card">
        <h2>Come li usiamo</h2>
        <p>Solo per erogare e migliorare il servizio: far funzionare il coach, adattare le lezioni al tuo livello, inviarti le notifiche che hai richiesto e capire, in forma aggregata, come viene usata l&rsquo;app. Non vendiamo i tuoi dati e non li condividiamo per pubblicità.</p>
      </section>

      <section className="card">
        <h2>Chi ci aiuta a fornire il servizio</h2>
        <p>Le conversazioni con il coach sono elaborate da <strong>OpenAI</strong> (intelligenza artificiale) in qualità di fornitore tecnico: secondo i termini API di OpenAI, i dati non vengono usati per addestrare i loro modelli. L&rsquo;app è ospitata su <strong>Vercel</strong> e il database su <strong>Turso</strong>. Alcuni fornitori possono trattare dati fuori dall&rsquo;Unione Europea con le garanzie previste dal GDPR (clausole contrattuali standard).</p>
      </section>

      <section className="card">
        <h2>Per quanto li conserviamo</h2>
        <p>Finché il tuo account è attivo. Puoi chiedere in ogni momento la cancellazione completa dell&rsquo;account e di tutti i dati scrivendo all&rsquo;email sopra: provvediamo entro 30 giorni.</p>
      </section>

      <section className="card">
        <h2>I tuoi diritti</h2>
        <p>Ai sensi del GDPR puoi chiedere l&rsquo;accesso, la rettifica, la cancellazione o la portabilità dei tuoi dati, e opporti al trattamento. Se ritieni che qualcosa non vada, puoi anche presentare reclamo al Garante per la protezione dei dati personali (garanteprivacy.it).</p>
      </section>

      <p className="itHint" style={{ margin: "14px 4px 24px", textAlign: "center" }}>
        <Link href="/termini">Termini di servizio</Link> · <Link href="/">Torna all&rsquo;inizio</Link>
      </p>
    </main>
  );
}

import Link from "next/link";

export const metadata = { title: "Termini di servizio · ExecLingo" };

/** Termini di servizio — public page, linked from landing and register. */
export default function TerminiPage() {
  return (
    <main className="shell">
      <div className="topbar"><div className="brand">ExecLingo</div><Link className="chip" href="/">← Indietro</Link></div>
      <section className="hero">
        <div className="kicker">Termini di servizio</div>
        <h1>Le regole, semplici.</h1>
        <p className="muted">Ultimo aggiornamento: agosto 2026</p>
      </section>

      <section className="card">
        <h2>Cos&rsquo;è ExecLingo</h2>
        <p>ExecLingo è un servizio di coaching linguistico basato su intelligenza artificiale, offerto da <strong>VASP ITALIA SRL</strong> (Via M. Schipa 22, 80122 Napoli — P.IVA 03463400634, PEC vasp@pec.it, contatto <a href="mailto:ug@vaspitalia.com">ug@vaspitalia.com</a>) e nato dall&rsquo;esperienza diretta di CEO, dirigenti e quadri d&rsquo;azienda. Sam, il coach, ti accompagna con sessioni scritte e vocali, notifiche durante il giorno e un percorso di tre mesi orientato all&rsquo;inglese di lavoro e di viaggio.</p>
      </section>

      <section className="card">
        <h2>Il tuo account</h2>
        <p>L&rsquo;account è personale: il codice di accesso non va condiviso. Sei responsabile di ciò che avviene con le tue credenziali. Se perdi il codice puoi recuperare l&rsquo;accesso contattandoci.</p>
      </section>

      <section className="card">
        <h2>Cosa puoi aspettarti (e cosa no)</h2>
        <p>Il percorso è costruito perché in tre mesi, con pratica regolare, tu possa diventare operativo in inglese nelle situazioni di lavoro e di viaggio. I risultati dipendono però dalla tua costanza: nessun metodo può garantire un esito identico per tutti.</p>
        <p>Il coach è un&rsquo;intelligenza artificiale: è accurato ma può commettere errori. Il servizio richiede una connessione a Internet e un dispositivo compatibile con le notifiche.</p>
      </section>

      <section className="card">
        <h2>Prezzi e pagamenti</h2>
        <p>I prezzi indicati sull&rsquo;app possono cambiare; eventuali modifiche non toccano i periodi già pagati. Quando acquisti online hai diritto di recesso entro 14 giorni, salvo che il servizio sia già stato interamente fruito su tua richiesta. Le modalità di pagamento e fatturazione sono indicate al momento dell&rsquo;acquisto.</p>
      </section>

      <section className="card">
        <h2>Uso corretto</h2>
        <p>Non è consentito usare il servizio per scopi illeciti, tentare di comprometterne la sicurezza o rivendere l&rsquo;accesso. Possiamo sospendere gli account che violano queste regole.</p>
      </section>

      <section className="card">
        <h2>Responsabilità e legge applicabile</h2>
        <p>Il servizio è fornito &ldquo;così com&rsquo;è&rdquo;, con la massima cura ma senza garanzia di assenza di interruzioni. Nei limiti di legge, la responsabilità è limitata a quanto pagato per il servizio. Questi termini sono regolati dalla legge italiana; per i consumatori resta fermo il foro del luogo di residenza.</p>
      </section>

      <p className="itHint" style={{ margin: "14px 4px 24px", textAlign: "center" }}>
        <Link href="/privacy">Informativa privacy</Link> · <Link href="/">Torna all&rsquo;inizio</Link>
      </p>
    </main>
  );
}

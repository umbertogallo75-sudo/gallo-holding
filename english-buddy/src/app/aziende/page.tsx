import Link from "next/link";
import { isEmbeddedApp } from "@/lib/appclient";
import { CompanyForm } from "./CompanyForm";

export const metadata = {
  title: "ExecLingo per aziende — inglese operativo per il tuo team",
  description: "Licenze team del programma 3 mesi con sconti volume: 10+ −5%, 50+ −10%, 150+ −15%. Codici subito via email, attivazione self-service.",
};

/** Public self-service B2B page: buy N seats, get license codes by email. */
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
          <p className="muted">Le aziende attivano licenze team per i propri dipendenti: ogni collega riceve un codice e attiva il percorso in un minuto dal proprio profilo.</p>
          <p className="itHint">Hai ricevuto un codice dalla tua azienda? Vai su Profilo → 💳 Abbonamento e inseriscilo lì.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">ExecLingo · Aziende</div><Link className="chip" href="/">← Sito</Link></div>

      {esito === "ok" ? (
        <section className="card" style={{ borderColor: "color-mix(in srgb, var(--accent) 55%, var(--line))" }}>
          <h2 style={{ marginTop: 0 }}>🎉 Ordine ricevuto!</h2>
          <p className="muted" style={{ margin: 0 }}>I codici licenza stanno arrivando all&rsquo;email del referente (controlla anche lo spam). Ogni collega attiva il suo in un minuto.</p>
        </section>
      ) : null}
      {esito === "annullato" ? (
        <section className="card"><p className="muted" style={{ margin: 0 }}>Pagamento annullato — nessun addebito.</p></section>
      ) : null}

      <section className="hero">
        <div className="kicker">ExecLingo per aziende</div>
        <h1>Il tuo team operativo in inglese. In 3 mesi.</h1>
        <p className="muted">Il 3-Month Executive Path per manager e team: pochi minuti al giorno, business reale, progressi misurabili. Compri le licenze ora, i codici arrivano subito via email, ogni persona attiva il suo percorso in autonomia.</p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Sconti volume</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="adminTable" style={{ fontSize: 15 }}>
            <thead><tr><th>Licenze</th><th>Sconto</th><th>Prezzo/licenza</th></tr></thead>
            <tbody>
              <tr><td>10 – 49</td><td>−5%</td><td><strong>94,90 €</strong></td></tr>
              <tr><td>50 – 149</td><td>−10%</td><td><strong>89,90 €</strong></td></tr>
              <tr><td>150+</td><td>−15%</td><td><strong>84,90 €</strong></td></tr>
            </tbody>
          </table>
        </div>
        <p className="itHint" style={{ marginBottom: 0 }}>Prezzi <strong>IVA inclusa</strong>: il totale che vedi è quello che paghi. Prezzo pieno 99,90 € a persona, una tantum, programma completo di 3 mesi. Sconto applicato automaticamente al totale.</p>
      </section>

      <CompanyForm />

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Come funziona</h2>
        <div className="profileRows">
          <div><span className="muted">1. Acquisti</span><strong>N licenze in un pagamento</strong></div>
          <div><span className="muted">2. Ricevi</span><strong>N codici via email, subito</strong></div>
          <div><span className="muted">3. Distribuisci</span><strong>un codice a ogni collega</strong></div>
          <div><span className="muted">4. Attivano</span><strong>registrazione + codice, 1 minuto</strong></div>
        </div>
        <p className="itHint" style={{ marginBottom: 0 }}>Ordini superiori a 1.000 licenze, fatturazione dedicata o domande: <strong>ug@vaspitalia.com</strong></p>
      </section>

      <p className="itHint" style={{ margin: "14px 4px 24px", textAlign: "center" }}>
        ExecLingo · un servizio VASP ITALIA SRL · <Link href="/termini">Termini</Link> · <Link href="/privacy">Privacy</Link>
      </p>
    </main>
  );
}

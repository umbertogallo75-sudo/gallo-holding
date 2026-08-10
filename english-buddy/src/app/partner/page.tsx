import Link from "next/link";

export const metadata = {
  title: "Diventa Partner ExecLingo — guadagna il 5% sulle vendite",
  description: "Programma partner self-service: link personale, QR, kit marketing pronto e 5% di provvigione sul venduto. Attivazione in 2 minuti.",
};

/** Public page: become an ExecLingo partner (self-service, no approval). */
export default function PartnerLandingPage() {
  return (
    <main className="shell">
      <div className="topbar"><div className="brand">ExecLingo · Partner</div><Link className="chip" href="/">← Sito</Link></div>

      <section className="hero">
        <div className="kicker">Programma Partner</div>
        <h1>Promuovi ExecLingo. Guadagna il 5%.</h1>
        <p className="muted">Agenti commerciali, consulenti, influencer, ambassador, professionisti: porta nuovi clienti a ExecLingo e ricevi il <strong>5% di provvigione</strong> sul venduto (al netto dell&rsquo;IVA). Attivazione immediata, senza approvazioni.</p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Come funziona</h2>
        <div className="profileRows">
          <div><span className="muted">1. Ti registri</span><strong>2 minuti, tutto online</strong></div>
          <div><span className="muted">2. Ricevi subito</span><strong>link, codice e QR personali</strong></div>
          <div><span className="muted">3. Promuovi</span><strong>kit marketing già pronto</strong></div>
          <div><span className="muted">4. Guadagni</span><strong>5% su ogni vendita attribuita</strong></div>
        </div>
        <p className="itHint" style={{ marginBottom: 0 }}>Vale sia online (link, QR, social) sia per il lavoro commerciale tradizionale: puoi registrare i tuoi contatti (incontri, telefonate, WhatsApp) e la vendita resta tua anche senza link.</p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>I numeri</h2>
        <div className="profileRows">
          <div><span className="muted">Provvigione standard</span><strong>5% (massimo di piattaforma)</strong></div>
          <div><span className="muted">Attribuzione cliente</span><strong>30 giorni dal click</strong></div>
          <div><span className="muted">Protezione lead commerciali</span><strong>fino a 60 giorni</strong></div>
          <div><span className="muted">Maturazione provvigioni</span><strong>30 giorni (tutela rimborsi)</strong></div>
          <div><span className="muted">Pagamento minimo</span><strong>50 €</strong></div>
        </div>
      </section>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "6px 0 24px" }}>
        <Link href="/partner/dashboard" className="primary full" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
          Diventa Partner — attivazione immediata
        </Link>
        <p className="itHint" style={{ textAlign: "center", margin: 0 }}>Se hai già un account ExecLingo usi quello; altrimenti lo crei al volo. Esempio provvigione: cliente da 99,90 € → 81,89 € netto IVA → <strong>4,09 € a te</strong>.</p>
      </div>

      <p className="itHint" style={{ margin: "0 4px 24px", textAlign: "center" }}>
        ExecLingo · un servizio VASP ITALIA SRL · <Link href="/termini">Termini</Link> · <Link href="/privacy">Privacy</Link>
      </p>
    </main>
  );
}

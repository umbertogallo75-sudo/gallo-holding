"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TYPES: Array<[string, string]> = [
  ["AFFILIATE", "Affiliato / passaparola"],
  ["SALES_AGENT", "Agente commerciale"],
  ["AMBASSADOR", "Ambassador"],
  ["INFLUENCER", "Influencer / creator"],
  ["CONSULTANT", "Consulente"],
  ["CORPORATE_PARTNER", "Partner aziendale"],
  ["INTERNAL_SALES", "Vendite interne"],
  ["OTHER", "Altro"],
];

export function JoinForm() {
  const [country, setCountry] = useState("Italia");
  const [partnerType, setPartnerType] = useState("AFFILIATE");
  const [accept, setAccept] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!accept) return setError("Devi accettare i termini del programma partner.");
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/partner/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country, partnerType, acceptTerms: true }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.error || "Qualcosa non ha funzionato.");
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Connessione assente. Riprova.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={join} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ margin: 0 }}>Completa l&rsquo;attivazione partner</h2>
      <p className="muted" style={{ margin: 0 }}>Un minuto: paese, tipo di partner, termini — e sei operativo con il tuo link e il 5%.</p>
      <input className="field" required minLength={2} placeholder="Paese" value={country} onChange={(e) => setCountry(e.target.value)} />
      <select className="field" value={partnerType} onChange={(e) => setPartnerType(e.target.value)}>
        {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14 }}>
        <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} style={{ marginTop: 3 }} />
        <span className="muted">Accetto i termini del programma partner: provvigione massima 5% sul netto IVA, attribuzione 30 giorni, maturazione 30 giorni, niente auto-referral, pagamento da 50 € con dati di incasso completi. Valgono inoltre <a href="/termini" style={{ textDecoration: "underline" }}>Termini</a> e <a href="/privacy" style={{ textDecoration: "underline" }}>Privacy</a> di ExecLingo.</span>
      </label>
      {error ? <p className="warnText" style={{ margin: 0 }}>{error}</p> : null}
      <button className="primary full" disabled={loading}>{loading ? "Attivazione…" : "Attiva il mio account partner"}</button>
    </form>
  );
}

"use client";

import { useState } from "react";

const MIN = 10;
const MAX = 1000;

function unitCents(quantity: number): number {
  if (quantity >= 150) return 8490;
  if (quantity >= 50) return 8990;
  return 9490;
}

const euro = (cents: number) => (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2 }) + " €";

export function CompanyForm() {
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [quantity, setQuantity] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validQty = Number.isFinite(quantity) && quantity >= MIN && quantity <= MAX;
  const unit = unitCents(validQty ? quantity : MIN);
  const discount = unit === 8490 ? "−15%" : unit === 8990 ? "−10%" : "−5%";

  async function buy(e: React.FormEvent) {
    e.preventDefault();
    if (!validQty) return setError(`Minimo ${MIN} licenze, massimo ${MAX}.`);
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/billing/company-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, email, quantity }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) {
        setError(data.error || "Qualcosa non ha funzionato. Riprova.");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Connessione assente. Riprova.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={buy} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ margin: "0 0 4px" }}>Attiva il tuo team</h2>
      <input className="field" required minLength={2} placeholder="Nome azienda" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
      <p className="itHint" style={{ margin: "0 4px" }}>Ragione sociale (comparirà nelle licenze)</p>
      <input className="field" type="email" required placeholder="Email del referente" value={email} onChange={(e) => setEmail(e.target.value)} />
      <p className="itHint" style={{ margin: "0 4px" }}>Qui arriveranno i codici licenza da distribuire</p>
      <input
        className="field"
        type="number"
        min={MIN}
        max={MAX}
        required
        value={Number.isFinite(quantity) ? quantity : ""}
        onChange={(e) => setQuantity(parseInt(e.target.value, 10))}
      />
      <p className="itHint" style={{ margin: "0 4px" }}>Numero di licenze (minimo {MIN})</p>

      <div className="card" style={{ background: "color-mix(in srgb, var(--accent) 7%, var(--surface))", margin: "6px 0 2px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
          <span className="muted">Prezzo per licenza ({discount})</span><strong>{euro(unit)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, marginTop: 6 }}>
          <span>Totale {validQty ? quantity : MIN} licenze</span><strong>{euro(unit * (validQty ? quantity : MIN))}</strong>
        </div>
        <div style={{ fontSize: 13, marginTop: 4, textAlign: "right" }} className="muted">IVA inclusa — paghi esattamente questo importo</div>
      </div>

      {error ? <p className="warnText" style={{ margin: "4px 0 0" }}>{error}</p> : null}
      <button className="primary full" disabled={loading}>{loading ? "Un attimo…" : "Procedi al pagamento sicuro"}</button>
      <p className="itHint" style={{ margin: "2px 4px", textAlign: "center" }}>Pagamento con Stripe (carta o bonifico ove disponibile) · Partita IVA inseribile al checkout</p>
    </form>
  );
}

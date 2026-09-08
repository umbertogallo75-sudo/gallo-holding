"use client";

import { useState } from "react";

const MIN = 10;
const MAX = 1000;

type Plan = "program" | "annual";

// Mirrors TEAM_PLANS in src/lib/licenses.ts, which cannot be imported here
// (it pulls in node:crypto and the database client). tests/licenses.test.ts
// fails if the two ever drift apart.
const PLANS: Record<Plan, { label: string; note: string; full: number; tiers: [number, number, number] }> = {
  program: { label: "Programma 3 mesi", note: "Da zero a operativo, una tantum", full: 9990, tiers: [9490, 8990, 8490] },
  annual: { label: "Annuale 12 mesi", note: "Il team resta con Sam tutto l’anno", full: 19900, tiers: [18900, 17900, 16900] },
};

function unitCents(quantity: number, plan: Plan): number {
  const [ten, fifty, hundredFifty] = PLANS[plan].tiers;
  if (quantity >= 150) return hundredFifty;
  if (quantity >= 50) return fifty;
  return ten;
}

const euro = (cents: number) => (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2 }) + " €";

export function CompanyForm() {
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [quantity, setQuantity] = useState(10);
  const [plan, setPlan] = useState<Plan>("program");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validQty = Number.isFinite(quantity) && quantity >= MIN && quantity <= MAX;
  const seats = validQty ? quantity : MIN;
  const unit = unitCents(seats, plan);
  const discount = seats >= 150 ? "−15%" : seats >= 50 ? "−10%" : "−5%";

  async function buy(e: React.FormEvent) {
    e.preventDefault();
    if (!validQty) return setError(`Minimo ${MIN} licenze, massimo ${MAX}.`);
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/billing/company-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, email, quantity, plan }),
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

      <fieldset style={{ border: 0, padding: 0, margin: "8px 0 0", display: "grid", gap: 8 }}>
        <legend className="itHint" style={{ padding: 0, margin: "0 4px 2px" }}>Pacchetto</legend>
        {(Object.keys(PLANS) as Plan[]).map((key) => {
          const chosen = plan === key;
          return (
            <label
              key={key}
              style={{
                display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px",
                borderColor: chosen ? "color-mix(in srgb, var(--accent) 55%, var(--line))" : undefined,
                background: chosen ? "color-mix(in srgb, var(--accent) 7%, var(--surface))" : undefined,
              }}
            >
              <input type="radio" name="plan" value={key} checked={chosen} onChange={() => setPlan(key)} />
              <span style={{ display: "grid", gap: 2, flex: 1 }}>
                <strong>{PLANS[key].label}</strong>
                <span className="itHint" style={{ margin: 0 }}>{PLANS[key].note}</span>
              </span>
              <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <strong>{euro(unitCents(seats, key))}</strong>
                <span className="itHint" style={{ display: "block", margin: 0 }}>a licenza</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="card" style={{ background: "color-mix(in srgb, var(--accent) 7%, var(--surface))", margin: "6px 0 2px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
          <span className="muted">{PLANS[plan].label} ({discount})</span><strong>{euro(unit)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, marginTop: 6 }}>
          <span>Totale {seats} licenze</span><strong>{euro(unit * seats)}</strong>
        </div>
        <div style={{ fontSize: 13, marginTop: 4, textAlign: "right" }} className="muted">IVA inclusa — paghi esattamente questo importo</div>
      </div>

      {error ? <p className="warnText" style={{ margin: "4px 0 0" }}>{error}</p> : null}
      <button className="primary full" disabled={loading}>{loading ? "Un attimo…" : "Procedi al pagamento sicuro"}</button>
      <p className="itHint" style={{ margin: "2px 4px", textAlign: "center" }}>Pagamento con Stripe (carta o bonifico ove disponibile) · Partita IVA inseribile al checkout</p>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PayoutForm() {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  if (!open) return <button type="button" className="secondary full" onClick={() => setOpen(true)}>🏦 Inserisci i dati per ricevere i pagamenti</button>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const r = await fetch("/api/partner/payout-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, details }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setStatus(data.error || "Errore"); setBusy(false); return; }
      setStatus("Dati salvati ✓");
      setBusy(false);
      router.refresh();
    } catch {
      setStatus("Connessione assente.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h3 style={{ margin: 0 }}>Dati di incasso</h3>
      <select className="field" value={method} onChange={(e) => setMethod(e.target.value)}>
        <option value="BANK_TRANSFER">Bonifico bancario</option>
        <option value="PAYPAL">PayPal</option>
        <option value="OTHER">Altro</option>
      </select>
      <textarea className="field" required minLength={5} rows={3} placeholder="Intestatario, IBAN (o email PayPal), eventuale P.IVA per la fattura" value={details} onChange={(e) => setDetails(e.target.value)} />
      <p className="itHint" style={{ margin: 0 }}>Le provvigioni maturano anche senza questi dati, ma i pagamenti partono solo dopo averli completati.</p>
      {status ? <p className="itHint" style={{ margin: 0 }}>{status}</p> : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>Chiudi</button>
        <button className="primary" style={{ flex: 1 }} disabled={busy}>{busy ? "Salvo…" : "Salva"}</button>
      </div>
    </form>
  );
}

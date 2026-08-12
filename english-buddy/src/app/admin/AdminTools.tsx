"use client";

import { useState } from "react";

/** One-off maintenance actions for the owner. */
export function AdminTools() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);

  async function voidTestLicenses() {
    if (!window.confirm("Annullare TUTTI i codici licenza non ancora usati? Serve per invalidare i codici generati durante i collaudi sandbox. I codici già riscattati non vengono toccati.")) return;
    setBusy(true);
    setStatus("");
    try {
      const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "voidtestlicenses" }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Errore");
      setStatus(`Annullati ${data.voided} codici ✓`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  async function makeGiftCodes() {
    const raw = window.prompt("Quanti codici omaggio? (1-5)", "5");
    if (!raw) return;
    const quantity = Math.min(5, Math.max(1, Number(raw) || 0));
    if (!quantity) return;
    setBusy(true);
    setStatus("");
    setCodes([]);
    try {
      const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "makelicenses", quantity, label: "Omaggio amici" }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Errore");
      setCodes(data.codes as string[]);
      setStatus(`${(data.codes as string[]).length} codici generati ✓ (ogni codice = Programma 3 mesi gratis)`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ margin: "4px 0 10px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="pill" disabled={busy} onClick={makeGiftCodes}>🎁 Genera codici omaggio</button>
        <button className="pill" disabled={busy} onClick={voidTestLicenses}>🧹 Annulla licenze di prova</button>
        {status ? <span className="itHint">{status}</span> : null}
      </div>
      {codes.length > 0 ? (
        <div className="card" style={{ marginTop: 8 }}>
          {codes.map((c) => (
            <p key={c} style={{ margin: "4px 0", fontFamily: "monospace", fontSize: 16 }}>{c}</p>
          ))}
          <button
            className="pill"
            onClick={() => { navigator.clipboard?.writeText(codes.join("\n")); setStatus("Copiati ✓"); }}
          >
            📋 Copia tutti
          </button>
        </div>
      ) : null}
    </div>
  );
}

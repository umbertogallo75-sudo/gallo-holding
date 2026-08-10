"use client";

import { useState } from "react";

/** One-off maintenance actions for the owner. */
export function AdminTools() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "4px 0 10px" }}>
      <button className="pill" disabled={busy} onClick={voidTestLicenses}>🧹 Annulla licenze di prova</button>
      {status ? <span className="itHint">{status}</span> : null}
    </div>
  );
}

"use client";

import { FormEvent, useState } from "react";

export function ChangeCode() {
  const [open, setOpen] = useState(false);
  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setStatus(null);
    const response = await fetch("/api/auth/change-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentCode, newCode }),
    }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    setLoading(false);
    if (response?.ok) {
      setStatus({ ok: true, text: "Codice aggiornato ✓ Usa il nuovo codice dal prossimo accesso." });
      setCurrentCode(""); setNewCode("");
    } else {
      setStatus({ ok: false, text: data?.error || "Errore, riprova." });
    }
  }

  if (!open) {
    return <button className="secondary full" style={{ marginBottom: 10 }} onClick={() => setOpen(true)}>🔑 Cambia codice di accesso</button>;
  }

  return (
    <section className="card">
      <h2>Cambia codice</h2>
      <form onSubmit={submit}>
        <input className="field" type="password" autoComplete="current-password" required placeholder="Current code · Codice attuale" value={currentCode} onChange={(e) => setCurrentCode(e.target.value)} />
        <input className="field" type="password" autoComplete="new-password" required minLength={8} placeholder="New code, min 8 characters · Nuovo codice" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
        {status ? <div className="notice" style={{ margin: "4px 0 8px", color: status.ok ? "var(--success)" : undefined }}>{status.text}</div> : null}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="secondary" onClick={() => setOpen(false)}>Chiudi</button>
          <button className="primary" style={{ flex: 1 }} disabled={loading}>{loading ? "…" : "Salva nuovo codice"}</button>
        </div>
      </form>
    </section>
  );
}

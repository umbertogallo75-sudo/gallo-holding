"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RedeemBox() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/billing/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json().catch(() => ({}));
      setLoading(false);
      if (!response.ok) return setError(data.error || "Codice non valido.");
      setDone(true);
      router.refresh();
    } catch {
      setLoading(false);
      setError("Connessione assente. Riprova.");
    }
  }

  if (done) {
    return (
      <section className="card" style={{ borderColor: "color-mix(in srgb, var(--accent) 55%, var(--line))" }}>
        <h2 style={{ marginTop: 0 }}>🎉 Licenza attivata!</h2>
        <p className="muted" style={{ margin: 0 }}>Il tuo Programma 3 mesi è attivo. Sam ti aspetta in Home.</p>
      </section>
    );
  }

  return (
    <form onSubmit={redeem} className="card">
      <h2 style={{ marginTop: 0 }}>🏢 Hai un codice aziendale?</h2>
      <p className="muted" style={{ marginTop: 0 }}>Se la tua azienda ti ha dato un codice licenza (EXEC-…), inseriscilo qui: attiva il Programma 3 mesi senza pagare nulla.</p>
      <input className="field" required placeholder="EXEC-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ letterSpacing: ".08em", fontFamily: "ui-monospace, Menlo, monospace" }} />
      {error ? <p className="warnText" style={{ margin: "6px 0" }}>{error}</p> : null}
      <button className="secondary full" disabled={loading} style={{ marginTop: 8 }}>{loading ? "Verifico…" : "Attiva la licenza"}</button>
    </form>
  );
}

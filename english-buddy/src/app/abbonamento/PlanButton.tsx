"use client";

import { useState } from "react";

export function PlanButton({ plan, label }: { plan: string; label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
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
    <>
      <button className="primary full" style={{ marginTop: 12 }} disabled={loading} onClick={go}>
        {loading ? "Un attimo…" : label}
      </button>
      {error ? <p className="warnText" style={{ marginTop: 8 }}>{error}</p> : null}
    </>
  );
}

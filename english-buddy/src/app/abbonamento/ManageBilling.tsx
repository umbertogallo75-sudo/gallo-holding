"use client";

import { useState } from "react";

/**
 * Sends a web subscriber to Stripe's billing portal — cancel, change card,
 * download invoices. Shown only when the plan was actually bought with a card
 * on the site; store subscriptions are cancelled in the store.
 */
export function ManageBilling() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/billing/portal", { method: "POST" }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    if (response?.ok && data?.url) { window.location.href = data.url; return; }
    setLoading(false);
    setError(data?.error ?? "Non riesco ad aprire la gestione: riprova.");
  }

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Gestisci il tuo abbonamento</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Disdici quando vuoi, cambia la carta o scarica le fatture. Se disdici, resti operativo fino alla fine del periodo già pagato.
      </p>
      <button type="button" className="secondary full" disabled={loading} onClick={open}>
        {loading ? "Apro…" : "Disdici o cambia metodo di pagamento"}
      </button>
      {error ? <p className="warnText" style={{ margin: "8px 4px 0" }}>{error}</p> : null}
    </section>
  );
}

"use client";

import { useState } from "react";
import { ConfirmPill } from "./ConfirmPill";

/**
 * Finding somebody by the address they wrote from.
 *
 * The list of users on this page starts from profiles, and a profile only
 * exists once onboarding is finished — so whoever registered and stopped
 * before that is not on it. When the first erasure request arrived, the
 * account could not be found, and "we cannot find you" is not an answer a
 * controller is allowed to give under article 17.
 *
 * It also shows any live plan, because deleting the account does not cancel a
 * subscription and the person will have no way left to cancel it themselves.
 */
type Found = {
  found: boolean;
  userId?: string;
  name?: string | null;
  email?: string | null;
  createdAt?: string | null;
  hasProfile?: boolean;
  plan?: string | null;
  planName?: string | null;
  periodEnd?: string | null;
};

export function AdminUserLookup() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Found | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function call(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const response = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!response?.ok) {
      setError("Non ha funzionato. Riprova.");
      return null;
    }
    return (await response.json().catch(() => null)) as Record<string, unknown> | null;
  }

  async function find() {
    if (!email.trim()) return;
    setBusy(true); setError(""); setResult(null);
    const data = await call({ action: "finduser", email: email.trim() });
    if (data) setResult(data as Found);
    setBusy(false);
  }

  async function remove() {
    if (!result?.userId) return;
    setBusy(true); setError(""); setDone("");
    const data = await call({ action: "deleteuser", userId: result.userId });
    setBusy(false);
    // Said on the page, not in a dialog: an alert stops the browser exactly
    // like a confirm, and the result of a deletion is worth reading calmly.
    if (data) { setResult(null); setEmail(""); setDone("Account eliminato ✓"); }
  }

  return (
    <section className="card">
      <div className="kicker">Richieste GDPR · trova un account</div>
      {done ? <p className="composerNote" style={{ color: "var(--accent)", fontWeight: 650 }}>{done}</p> : null}
      <p className="composerNote" style={{ marginTop: 4 }}>
        Cerca per l&rsquo;indirizzo da cui la persona ha scritto. Trova anche chi si è registrato e non ha
        mai finito l&rsquo;onboarding, che nell&rsquo;elenco qui sotto non compare.
      </p>
      <div className="aliasRow" style={{ marginTop: 10 }}>
        <input
          className="linkInput"
          type="email"
          value={email}
          placeholder="indirizzo@esempio.it"
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void find(); }}
          aria-label="Email da cercare"
        />
        <button type="button" className="primary" disabled={busy || !email.trim()} onClick={find}>
          {busy ? "…" : "Cerca"}
        </button>
      </div>

      {error ? <div className="notice" style={{ marginTop: 10 }}>{error}</div> : null}

      {result && !result.found ? (
        <div className="notice" style={{ marginTop: 12 }}>
          <strong>Nessun account con questo indirizzo.</strong> Può essersi registrata con un altro
          indirizzo — se ha usato <strong>Accedi con Apple</strong>, il suo account porta un indirizzo
          <em> privaterelay.appleid.com</em> e non quello personale. Chiediglielo prima di rispondere che non esiste.
        </div>
      ) : null}

      {result?.found ? (
        <div className="card" style={{ marginTop: 12, background: "var(--soft)" }}>
          <p style={{ margin: 0, fontWeight: 700 }}>{result.name || "(senza nome)"} · {result.email}</p>
          <p className="composerNote" style={{ margin: "6px 0 0" }}>
            Registrato il {result.createdAt?.slice(0, 10) ?? "—"} ·{" "}
            {result.hasProfile ? "profilo completo" : "registrato ma onboarding mai completato"}
          </p>
          {result.plan ? (
            <div className="notice" style={{ marginTop: 10 }}>
              ⚠️ <strong>Accesso attivo: {result.planName ?? result.plan}</strong>
              {result.periodEnd ? ` fino al ${result.periodEnd.slice(0, 10)}` : ""}.
              Se è un abbonamento ricorrente, <strong>va disdetto prima</strong>: l&rsquo;eliminazione non lo annulla,
              e dopo la cancellazione la persona non ha più modo di farlo da sola. Su Apple e Google puoi disdirlo solo tu tramite lei.
            </div>
          ) : (
            <p className="composerNote" style={{ margin: "6px 0 0" }}>Nessun piano attivo: si può procedere.</p>
          )}
          <div style={{ marginTop: 12 }}>
            <ConfirmPill
              label="🗑 Elimina definitivamente"
              question={`Elimina ${result.email} e tutti i suoi dati. Non è reversibile.`}
              danger
              disabled={busy}
              onConfirm={remove}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

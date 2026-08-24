"use client";

import { FormEvent, useState } from "react";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "manual">("idle");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    const response = await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    setState(data?.emailConfigured === false ? "manual" : "sent");
  }

  return (
    <main className="shell authWrap">
      <section className="authCard">
        <div className="brand">ExecLingo</div>
        <div className="hero">
          <div className="kicker">Recupera l&rsquo;accesso</div>
          <h1>Password dimenticata?</h1>
          <p className="muted">Inserisci l&rsquo;email con cui ti sei registrato: ti mandiamo un link per sceglierne una nuova.</p>
        </div>
        {state === "sent" ? (
          <div className="notice">Se l&rsquo;email è registrata riceverai il link entro un minuto. Controlla anche lo spam. Il link vale 30 minuti.</div>
        ) : state === "manual" ? (
          <div className="notice">Il recupero via email non è ancora attivo. Contatta l&rsquo;amministratore: può darti subito una password temporanea, poi la cambierai dal tuo Profilo.</div>
        ) : (
          <form onSubmit={submit}>
            <input className="field" type="email" autoComplete="email" required placeholder="La tua email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="composerNote" style={{ margin: "0 4px 6px" }}>L&rsquo;email usata alla registrazione</p>
            <button className="primary full" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send reset link · Invia il link"}</button>
          </form>
        )}
        <p className="muted" style={{ marginTop: 14, fontSize: 14 }}>
          <a href="/login" style={{ textDecoration: "underline" }}>← Back to login · Torna all&rsquo;accesso</a>
        </p>
      </section>
    </main>
  );
}

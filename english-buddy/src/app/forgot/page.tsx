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
        <div className="brand">English Buddy</div>
        <div className="hero">
          <div className="kicker">Recover access</div>
          <h1>Forgot your code?</h1>
          <p className="muted">Enter the email you registered with and we&rsquo;ll send you a link to choose a new code.</p>
          <p className="itHint">Hai dimenticato il codice? Inserisci l&rsquo;email con cui ti sei registrato: ti invieremo un link per sceglierne uno nuovo.</p>
        </div>
        {state === "sent" ? (
          <div className="notice">If this email is registered, you&rsquo;ll receive a reset link within a minute. Check spam too.<span className="itHint" style={{ display: "block" }}>Se l&rsquo;email è registrata riceverai il link entro un minuto. Controlla anche lo spam. Il link vale 30 minuti.</span></div>
        ) : state === "manual" ? (
          <div className="notice">Email recovery is not active yet. Contact the administrator: they can give you a temporary code right away.<span className="itHint" style={{ display: "block" }}>Il recupero via email non è ancora attivo. Contatta l&rsquo;amministratore (chi ti ha invitato): può darti subito un codice temporaneo, poi lo cambierai dal tuo Profilo.</span></div>
        ) : (
          <form onSubmit={submit}>
            <input className="field" type="email" autoComplete="email" required placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="itHint" style={{ margin: "0 4px 6px" }}>L&rsquo;email usata alla registrazione</p>
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

"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { WelcomeIntro } from "@/components/WelcomeIntro";
import { reportSignupConversion } from "@/lib/conversions";

export function RegisterForm({ oauth }: { oauth: React.ReactNode }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [refCode, setRefCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, code, refCode: refCode.trim() || undefined }),
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) return setError(data.error || "Registration failed");
    // Report before navigating: the account exists from here on, and the tag
    // has to fire while this page is still the one on screen.
    reportSignupConversion();
    router.push("/");
    router.refresh();
  }

  return (
    <main className="shell authWrap">
      <WelcomeIntro />
      <section className="authCard">
        <div className="brand">ExecLingo</div>
        <div className="hero">
          <div className="kicker">Get started</div>
          <h1>Create your access.</h1>
          <p className="muted">Choose your password — you will use it with your email every time you log in.</p>
          <p className="itHint">Crea il tuo accesso: nome, email e una password (minimo 8 caratteri). Entrerai sempre con email e password.</p>
        </div>
        {oauth}<form onSubmit={submit}>
          <input className="field" required placeholder="Your first name" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="itHint" style={{ margin: "0 4px 6px" }}>Il tuo nome</p>
          <input className="field" type="email" autoComplete="email" required placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <p className="itHint" style={{ margin: "0 4px 6px" }}>La tua email (per comunicazioni sul tuo percorso)</p>
          <input className="field" type="password" autoComplete="new-password" required minLength={8} placeholder="Choose a password (min 8 characters)" value={code} onChange={(e) => setCode(e.target.value)} />
          <p className="itHint" style={{ margin: "0 4px 6px" }}>Scegli la tua password (minimo 8 caratteri)</p>
          <input className="field" placeholder="Partner code (optional)" value={refCode} onChange={(e) => setRefCode(e.target.value.toUpperCase())} />
          <p className="itHint" style={{ margin: "0 4px 6px" }}>Codice partner (opzionale): se qualcuno ti ha presentato ExecLingo, inserisci qui il suo codice</p>
          {error ? <div className="notice" style={{ marginBottom: 8 }}>{error}</div> : null}
          <button className="primary full" disabled={loading}>{loading ? "Creating…" : "Create my access"}</button>
          <p className="itHint" style={{ margin: "6px 4px", textAlign: "center" }}>Crea il mio accesso</p>
          <p className="itHint" style={{ margin: "2px 4px", textAlign: "center" }}>
            Registrandoti accetti i <a href="/termini" style={{ textDecoration: "underline" }}>Termini</a> e l&rsquo;<a href="/privacy" style={{ textDecoration: "underline" }}>Informativa privacy</a>
          </p>
        </form>
        <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>
          Already registered? <a href="/login" style={{ textDecoration: "underline" }}>Log in</a>
          <span className="itHint" style={{ display: "block" }}>Hai già un account? Entra da qui</span>
        </p>
      </section>
    </main>
  );
}

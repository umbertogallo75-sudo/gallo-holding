"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { WelcomeIntro } from "@/components/WelcomeIntro";

export function RegisterForm({ oauth }: { oauth: React.ReactNode }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
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
      body: JSON.stringify({ name, email, code }),
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) return setError(data.error || "Registration failed");
    router.push("/");
    router.refresh();
  }

  return (
    <main className="shell authWrap">
      <WelcomeIntro />
      <section className="authCard">
        <div className="brand">English Buddy</div>
        <div className="hero">
          <div className="kicker">Get started</div>
          <h1>Create your access.</h1>
          <p className="muted">Choose your personal access code — you will use it every time you log in. Keep it private.</p>
          <p className="itHint">Crea il tuo accesso: scegli un codice personale segreto (minimo 8 caratteri) — lo userai ogni volta per entrare. Non condividerlo con nessuno.</p>
        </div>
        {oauth}<form onSubmit={submit}>
          <input className="field" required placeholder="Your first name" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="itHint" style={{ margin: "0 4px 6px" }}>Il tuo nome</p>
          <input className="field" type="email" autoComplete="email" required placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <p className="itHint" style={{ margin: "0 4px 6px" }}>La tua email (per comunicazioni sul tuo percorso)</p>
          <input className="field" type="password" autoComplete="new-password" required minLength={8} placeholder="Choose a personal access code (min 8 characters)" value={code} onChange={(e) => setCode(e.target.value)} />
          <p className="itHint" style={{ margin: "0 4px 6px" }}>Scegli il tuo codice segreto di accesso (minimo 8 caratteri) — come una password</p>
          {error ? <div className="notice" style={{ marginBottom: 8 }}>{error}</div> : null}
          <button className="primary full" disabled={loading}>{loading ? "Creating…" : "Create my access"}</button>
          <p className="itHint" style={{ margin: "6px 4px", textAlign: "center" }}>Crea il mio accesso</p>
        </form>
        <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>
          Already have a code? <a href="/login" style={{ textDecoration: "underline" }}>Log in</a>
          <span className="itHint" style={{ display: "block" }}>Hai già un codice? Entra da qui</span>
        </p>
      </section>
    </main>
  );
}

"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { WelcomeIntro } from "@/components/WelcomeIntro";
import { PASSWORD_SIGNUP_SUCCESS_PATH } from "@/lib/auth-destinations";
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
      body: JSON.stringify({
        name,
        email,
        code,
        refCode: refCode.trim() || undefined,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) return setError(data.error || "Registrazione non riuscita");

    // Report before navigating: the account exists from here on, and the tag
    // has to fire while this page is still the one on screen.
    reportSignupConversion();
    router.push(PASSWORD_SIGNUP_SUCCESS_PATH);
    router.refresh();
  }

  return (
    <main className="shell authWrap">
      <WelcomeIntro />
      <section className="authCard">
        <div className="brand">ExecLingo</div>
        <div className="hero">
          <div className="kicker">Test iniziale gratuito · circa 3 minuti</div>
          <h1>Quanto sei operativo in inglese quando il lavoro conta?</h1>
          <p className="muted">
            Crea il tuo accesso gratuito e scopri il tuo punto di partenza su
            riunioni, call, negoziazioni e trasferte.
            {oauth
              ? " Puoi usare l’accesso rapido oppure nome, email e password."
              : " Inserisci nome, email e una password di almeno 8 caratteri."}
          </p>
        </div>

        {oauth}

        <form onSubmit={submit}>
          <input
            className="field"
            required
            placeholder="Il tuo nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="field"
            type="email"
            autoComplete="email"
            required
            placeholder="La tua email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="composerNote" style={{ margin: "0 4px 6px" }}>
            Ci scriviamo qui per il tuo percorso
          </p>
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="Scegli una password (minimo 8 caratteri)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <input
            className="field"
            placeholder="Codice partner (facoltativo)"
            value={refCode}
            onChange={(e) => setRefCode(e.target.value.toUpperCase())}
          />
          <p className="composerNote" style={{ margin: "0 4px 6px" }}>
            Se qualcuno ti ha presentato ExecLingo, metti qui il suo codice
          </p>
          {error ? (
            <div className="notice" style={{ marginBottom: 8 }}>
              {error}
            </div>
          ) : null}
          <button className="primary full" disabled={loading}>
            {loading ? "Creo…" : "Inizia il test gratuito"}
          </button>
          <p
            className="composerNote"
            style={{ margin: "2px 4px", textAlign: "center" }}
          >
            Registrandoti accetti i{" "}
            <a href="/termini" style={{ textDecoration: "underline" }}>
              Termini
            </a>{" "}
            e l&rsquo;
            <a href="/privacy" style={{ textDecoration: "underline" }}>
              Informativa privacy
            </a>
          </p>
        </form>
        <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>
          Hai già un account?{" "}
          <a href="/login" style={{ textDecoration: "underline" }}>
            Entra da qui
          </a>
        </p>
      </section>
    </main>
  );
}

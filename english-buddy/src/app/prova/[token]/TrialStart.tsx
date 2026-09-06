"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TrialStart({
  token,
  alreadyStarted,
  active,
  signedIn,
}: {
  token: string;
  alreadyStarted: boolean;
  active: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function start() {
    setState("busy");
    try {
      const response = await fetch(`/api/prova/${token}`, { method: "POST" });
      if (!response.ok) throw new Error("failed");
      // The trial is on the account, not on the browser. Somebody reading the
      // email on a phone they have never signed into would otherwise be
      // bounced to a bare login screen the instant they accepted a gift.
      router.push(signedIn ? "/home" : "/login?attivata=1");
    } catch {
      setState("error");
    }
  }

  if (alreadyStarted && !active) {
    return (
      <>
        <h2 style={{ marginTop: 0 }}>Il tuo periodo gratuito è finito</h2>
        <p>La tua settimana gratis è finita. <strong>I tuoi progressi restano dove sono</strong> — livello, frasario ed errori su cui stavi lavorando ti aspettano. Se vuoi riprendere con Sam, i piani sono qui.</p>
        <a className="primary full" style={{ marginTop: 10, minHeight: 54, display: "block", textAlign: "center", lineHeight: "54px", textDecoration: "none" }} href="/abbonamento">Scegli il tuo piano</a>
      </>
    );
  }

  if (alreadyStarted) {
    return (
      <>
        <h2 style={{ marginTop: 0 }}>È già attivo ✅</h2>
        <p>Sei dentro la tua settimana gratis. Non serve fare altro: hai già tutto aperto.</p>
        <a className="primary full" style={{ marginTop: 10, minHeight: 54, display: "block", textAlign: "center", lineHeight: "54px", textDecoration: "none" }} href="/home">Vai da Sam</a>
      </>
    );
  }

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Pronto quando lo sei tu</h2>
      <p>Il tuo account è nato prima che la settimana gratis diventasse automatica. Puoi attivarla da qui.</p>
      {state === "error" ? <div className="notice">Non è partito. Riprova tra un momento.</div> : null}
      <button className="primary full" style={{ marginTop: 10, minHeight: 58, fontSize: 18 }} disabled={state === "busy"} onClick={start}>
        {state === "busy" ? "…" : "🎁 Attiva la mia settimana gratis"}
      </button>
    </>
  );
}

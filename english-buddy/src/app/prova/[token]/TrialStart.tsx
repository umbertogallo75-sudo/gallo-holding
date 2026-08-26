"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TrialStart({
  token,
  alreadyStarted,
  extended,
  active,
}: {
  token: string;
  alreadyStarted: boolean;
  extended: boolean;
  active: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function start() {
    setState("busy");
    try {
      const response = await fetch(`/api/prova/${token}`, { method: "POST" });
      if (!response.ok) throw new Error("failed");
      router.push("/home");
    } catch {
      setState("error");
    }
  }

  if (alreadyStarted && !active) {
    return (
      <>
        <h2 style={{ marginTop: 0 }}>Il tuo periodo gratuito è finito</h2>
        <p>{extended ? "Hai avuto le tue 48 ore — il percorso l'hai fatto davvero." : "Le tue 24 ore sono passate."} Se vuoi continuare con Sam, i piani sono qui.</p>
        <a className="primary full" style={{ marginTop: 10, minHeight: 54, display: "block", textAlign: "center", lineHeight: "54px", textDecoration: "none" }} href="/abbonamento">Scegli il tuo piano</a>
      </>
    );
  }

  if (alreadyStarted) {
    return (
      <>
        <h2 style={{ marginTop: 0 }}>È già attivo ✅</h2>
        <p>{extended ? "Hai completato il percorso: sei nelle 24 ore extra." : "Sei dentro le tue 24 ore. Non serve fare altro."}</p>
        <a className="primary full" style={{ marginTop: 10, minHeight: 54, display: "block", textAlign: "center", lineHeight: "54px", textDecoration: "none" }} href="/home">Vai da Sam</a>
      </>
    );
  }

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Pronto quando lo sei tu</h2>
      <p>Il conto alla rovescia parte da questo pulsante, non da prima.</p>
      {state === "error" ? <div className="notice">Non è partito. Riprova tra un momento.</div> : null}
      <button className="primary full" style={{ marginTop: 10, minHeight: 58, fontSize: 18 }} disabled={state === "busy"} onClick={start}>
        {state === "busy" ? "…" : "🎁 Attiva le mie 24 ore"}
      </button>
    </>
  );
}

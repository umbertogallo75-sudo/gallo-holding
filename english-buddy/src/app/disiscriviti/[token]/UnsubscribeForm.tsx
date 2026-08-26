"use client";

import { useState } from "react";

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "back" | "error">("idle");

  async function change(subscribed: boolean) {
    setState("busy");
    try {
      const response = await fetch(`/api/disiscriviti/${token}`, {
        method: subscribed ? "DELETE" : "POST",
      });
      if (!response.ok) throw new Error("failed");
      setState(subscribed ? "back" : "done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <>
        <h2 style={{ marginTop: 0 }}>Fatto. Non ti scriviamo più. ✅</h2>
        <p>Grazie comunque per averci provato — e se un giorno ti va di riprendere l&rsquo;inglese, Sam si ricorda ancora di te.</p>
        <button className="secondary full" onClick={() => change(true)}>Ho sbagliato, rimettimi in lista</button>
      </>
    );
  }
  if (state === "back") {
    return (
      <>
        <h2 style={{ marginTop: 0 }}>Bentornato. ✅</h2>
        <p style={{ marginBottom: 0 }}>Riceverai di nuovo i promemoria di Sam.</p>
      </>
    );
  }

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Conferma</h2>
      <p>Premi il pulsante e ti togliamo subito dalla lista.</p>
      {state === "error" ? <div className="notice">Qualcosa non ha funzionato. Riprova, o scrivi a ug@vaspitalia.com.</div> : null}
      <button className="primary full" style={{ marginTop: 10, minHeight: 54 }} disabled={state === "busy"} onClick={() => change(false)}>
        {state === "busy" ? "…" : "Sì, disiscrivimi"}
      </button>
    </>
  );
}

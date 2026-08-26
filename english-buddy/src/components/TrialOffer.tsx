"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The 24-hour offer, shown in the app to a registered account that has never
 * taken it. The paywall card sits below: this is the way in that costs
 * nothing, and it should be the first thing read.
 */
export function TrialOffer() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function claim() {
    setState("busy");
    try {
      const response = await fetch("/api/prova", { method: "POST" });
      if (!response.ok) throw new Error("failed");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <section className="trialOffer">
      <div className="trialTag">🎁 Prova gratuita</div>
      <p className="trialLine" style={{ marginTop: 4 }}>
        <strong>24 ore con tutto aperto</strong>, senza carta e senza rinnovo automatico. E se entro quelle 24 ore rispondi alle 3 domande del percorso e ti alleni <strong>10 minuti</strong>, te ne regaliamo <strong>altre 24</strong>.
      </p>
      {state === "error" ? <div className="notice" style={{ marginTop: 10 }}>Non è partito. Riprova tra un momento.</div> : null}
      <button className="primary full" style={{ marginTop: 12, minHeight: 54, fontSize: 17 }} disabled={state === "busy"} onClick={claim}>
        {state === "busy" ? "…" : "Attiva le mie 24 ore gratis"}
      </button>
      <p className="trialNote" style={{ textAlign: "center" }}>Il conto alla rovescia parte da qui.</p>
    </section>
  );
}

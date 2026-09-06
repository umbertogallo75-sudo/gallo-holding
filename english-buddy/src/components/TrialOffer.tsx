"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TRIAL_DAYS } from "@/lib/marketing/trial";

/**
 * The week, offered to an account old enough to have missed it.
 *
 * Every account created from now on starts its week the moment it exists, so
 * nobody new ever sees this. It stays for the people who registered under the
 * old rules and never clicked anything: they are owed the same seven days, and
 * this is the door.
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
      <div className="trialTag">🎁 La tua settimana gratis</div>
      <p className="trialLine" style={{ marginTop: 4 }}>
        <strong>{TRIAL_DAYS} giorni con tutto aperto</strong> — chat e voce con Sam, riunioni simulate, mail e
        documenti. Senza carta e senza rinnovo automatico: quando finisce, finisce.
      </p>
      {state === "error" ? <div className="notice" style={{ marginTop: 10 }}>Non è partito. Riprova tra un momento.</div> : null}
      <button className="primary full" style={{ marginTop: 12, minHeight: 54, fontSize: 17 }} disabled={state === "busy"} onClick={claim}>
        {state === "busy" ? "…" : `Attiva i miei ${TRIAL_DAYS} giorni gratis`}
      </button>
      <p className="trialNote" style={{ textAlign: "center" }}>Parte da adesso.</p>
    </section>
  );
}

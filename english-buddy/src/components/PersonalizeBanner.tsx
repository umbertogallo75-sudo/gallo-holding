"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Offered once to everybody who registered before the app started asking
 * where they are and what they need.
 *
 * Once, and only once: an invitation that reappears every morning stops being
 * an invitation. Closing it is an answer too — the defaults apply and the
 * question is never put again.
 */
export function PersonalizeBanner() {
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function dismiss() {
    setBusy(true);
    setGone(true);
    try {
      await fetch("/api/onboarding/salta", { method: "POST" });
    } catch {
      // Offline: it will be offered once more, which is better than losing
      // the answer somebody did give.
    }
    router.refresh();
  }

  if (gone) return null;

  return (
    <div className="personalize">
      <div>
        <strong>30 secondi per personalizzare il tuo percorso</strong>
        <span>Tre domande, un tocco ciascuna: da dove parti, a cosa ti serve, quanto tempo hai.</span>
      </div>
      <div className="personalizeActions">
        <a href="/onboarding" className="pill pillActive">Rispondi</a>
        <button type="button" className="pill" disabled={busy} onClick={dismiss}>Non ora</button>
      </div>
    </div>
  );
}

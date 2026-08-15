"use client";

import { useSyncExternalStore } from "react";
import { CONSENT_COOKIE, hasMarketingTags } from "@/lib/consent";
import { consentServerSnapshot, consentSnapshot, notifyConsentChanged, subscribeConsent } from "@/lib/consent-store";

/**
 * Lets a visitor take back a choice they already made — consent that cannot
 * be withdrawn as easily as it was given is not consent. Shows nothing when
 * no advertising tag is configured, or when nothing was ever asked.
 */
export function ConsentReset() {
  const state = useSyncExternalStore(subscribeConsent, consentSnapshot, consentServerSnapshot);
  if (!hasMarketingTags() || (state !== "granted" && state !== "denied")) return null;

  const clear = () => {
    document.cookie = `${CONSENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    notifyConsentChanged();
    // Tags already running on this page can only be stopped by reloading it.
    if (state === "granted") window.location.reload();
  };

  return (
    <p style={{ marginBottom: 0 }}>
      <strong>La tua scelta attuale:</strong>{" "}
      {state === "granted" ? "hai accettato i cookie di terze parti." : "hai rifiutato i cookie di terze parti."}
      <button type="button" className="chip" onClick={clear} style={{ marginLeft: 8 }}>Cambia scelta</button>
    </p>
  );
}

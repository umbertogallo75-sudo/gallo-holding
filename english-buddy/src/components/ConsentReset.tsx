"use client";

import { useSyncExternalStore } from "react";
import { CONSENT_COOKIE, hasMarketingTags, readConsentReceipt } from "@/lib/consent";
import { consentServerSnapshot, consentSnapshot, notifyConsentChanged, subscribeConsent } from "@/lib/consent-store";
import { logConsent } from "@/components/ConsentBanner";

/**
 * Lets a visitor take back a choice they already made — consent that cannot
 * be withdrawn as easily as it was given is not consent. The withdrawal is
 * logged too: proving that a yes was collected matters less than proving a
 * later no was honoured.
 */
export function ConsentReset() {
  const state = useSyncExternalStore(subscribeConsent, consentSnapshot, consentServerSnapshot);
  if (!hasMarketingTags() || (state !== "granted" && state !== "denied")) return null;

  const clear = () => {
    const receipt = readConsentReceipt(document.cookie);
    if (receipt) void logConsent(receipt, "withdrawn");
    const tiktokQueue = (window as Window & {
      ttq?: { revokeConsent?: () => void; disableCookie?: () => void };
    }).ttq;
    try {
      tiktokQueue?.revokeConsent?.();
      tiktokQueue?.disableCookie?.();
    } catch {
      // Reloading below still stops every tag even if a vendor API is absent.
    }
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

"use client";

import { useEffect, useState } from "react";
import { getPushStatus, subscribeToPush, type PushStatus } from "@/lib/push-client";

const DISMISS_KEY = "buddy-push-banner-dismissed";

/**
 * Launch bottom-sheet prompting to enable notifications. Once postponed, the
 * persistent NotificationReminder bar keeps nagging on every screen instead.
 */
export function EnablePush() {
  const [state, setState] = useState<PushStatus | "checking" | "subscribing">("checking");
  const [dismissed, setDismissed] = useState<boolean>(
    () => typeof window === "undefined" || sessionStorage.getItem(DISMISS_KEY) === "1"
  );

  useEffect(() => {
    (async () => {
      setState(await getPushStatus());
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setState("subscribing");
    const outcome = await subscribeToPush();
    setState(outcome === "subscribed" ? "subscribed" : outcome === "denied" ? "denied" : "need-enable");
  }

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  if (state === "subscribed") {
    return <p className="muted" style={{ fontSize: 13, margin: "4px 2px" }}>🔔 Buddy notifications are on. <span className="itHint">Le notifiche del Buddy sono attive.</span></p>;
  }

  // The persistent NotificationReminder bar handles every other state once
  // the launch sheet has been dismissed (or when notifications are blocked).
  if (state === "checking" || state === "unsupported" || state === "denied" || dismissed) return null;

  return (
    <div className="sheetBackdrop" role="dialog" aria-label="Enable notifications">
      <div className="sheet">
        <h2>🔔 Hear from your Buddy</h2>
        <p className="muted">
          {state === "need-install"
            ? "To get Buddy questions during the day, first add this app to your Home Screen: tap Share → Add to Home Screen, then open it from there."
            : "English Buddy was born to give you a coach who texts you during the day — short questions at natural moments, like a friend. Answer when you want; no streaks, no guilt."}
        </p>
        <p className="itHint">
          {state === "need-install"
            ? "L'app nasce per darti un coach che ti scrive durante il giorno. Per ricevere i suoi messaggi, prima installala: Condividi (⬆️) → Aggiungi alla schermata Home, poi aprila dall'icona."
            : "L'app nasce per darti un coach che ti scrive durante il giorno, come un amico. Attiva le notifiche per riceverne le domande — rispondi quando vuoi."}
        </p>
        {state !== "need-install" ? (
          <button className="primary full" style={{ marginTop: 12 }} disabled={state === "subscribing"} onClick={enable}>
            {state === "subscribing" ? "Enabling…" : "Enable notifications · Attiva le notifiche"}
          </button>
        ) : null}
        <button className="secondary full" style={{ marginTop: 8 }} onClick={dismiss}>Not now · Non ora</button>
        <p className="warnText">⚠️ App non funzionante senza notifiche abilitate.</p>
      </div>
    </div>
  );
}

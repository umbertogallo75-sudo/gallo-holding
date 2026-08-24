"use client";

import { useEffect, useState } from "react";
import { getPushStatus, lastPushError, subscribeToPush, type PushStatus } from "@/lib/push-client";

const DISMISS_KEY = "buddy-push-banner-dismissed";

/**
 * Launch bottom-sheet prompting to enable notifications. Once postponed, the
 * persistent NotificationReminder bar keeps nagging on every screen instead.
 */
export function EnablePush() {
  const [state, setState] = useState<PushStatus | "checking" | "subscribing">("checking");
  const [failed, setFailed] = useState(false);
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
    if (outcome !== "subscribed") setFailed(true);
    setState(outcome === "subscribed" ? "subscribed" : outcome === "denied" ? "denied" : "need-enable");
  }

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  if (state === "subscribed") {
    return <p className="muted" style={{ fontSize: 13, margin: "4px 2px" }}>🔔 Le notifiche di Sam sono attive.</p>;
  }

  // The persistent NotificationReminder bar handles every other state once
  // the launch sheet has been dismissed (or when notifications are blocked).
  if (state === "checking" || state === "unsupported" || state === "denied" || dismissed) return null;

  return (
    <div className="sheetBackdrop" role="dialog" aria-label="Attiva le notifiche">
      <div className="sheet">
        <h2>🔔 Fatti scrivere da Sam</h2>
        <p className="muted">
          {state === "need-install"
            ? "L'app nasce per darti un coach che ti scrive durante il giorno. Per ricevere i suoi messaggi, prima installala: Condividi (⬆️) → Aggiungi alla schermata Home, poi aprila dall'icona."
            : "ExecLingo nasce per darti un coach che ti scrive durante il giorno, come un amico: domande brevi nei momenti giusti. Rispondi quando vuoi — nessuna serie da non interrompere, nessun senso di colpa."}
        </p>
        {state !== "need-install" ? (
          <button className="primary full" style={{ marginTop: 12 }} disabled={state === "subscribing"} onClick={enable}>
            {state === "subscribing" ? "Attivo…" : "Attiva le notifiche"}
          </button>
        ) : null}
        {failed ? (
          <p className="composerNote" style={{ marginTop: 8 }}>
            ⚠️ Non sono riuscito ad attivarle da qui. <strong>Su Android</strong>: apri Impostazioni → App → ExecLingo → Notifiche, attiva &ldquo;Consenti notifiche&rdquo; e poi riprova qui. <strong>Su Mac</strong> serve Safari recente o Chrome; <strong>su iPhone</strong> prima installa l&rsquo;app. Puoi continuare comunque e attivarle più tardi.
            {lastPushError ? <span style={{ display: "block", opacity: 0.6, marginTop: 4 }}>Dettaglio tecnico: {lastPushError}</span> : null}
          </p>
        ) : null}
        <button className="secondary full" style={{ marginTop: 8 }} onClick={dismiss}>{failed ? "Continua senza notifiche" : "Non ora"}</button>
        <p className="warnText">⚠️ Senza notifiche il coach non può cercarti: l&rsquo;app perde la sua forza.</p>
      </div>
    </div>
  );
}

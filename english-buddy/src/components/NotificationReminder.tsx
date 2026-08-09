"use client";

import { useEffect, useState } from "react";
import { getPushStatus, subscribeToPush, type PushStatus } from "@/lib/push-client";

/**
 * Persistent, non-dismissable reminder shown on every main screen until
 * notifications are active: the app exists to be a coach that reaches you
 * during the day — without notifications it doesn't really work.
 */
export function NotificationReminder() {
  const [status, setStatus] = useState<PushStatus | "checking">("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setStatus(await getPushStatus());
    })().catch(() => setStatus("unsupported"));
  }, []);

  if (status === "checking" || status === "unsupported" || status === "subscribed") return null;

  async function enable() {
    setBusy(true);
    const outcome = await subscribeToPush();
    setBusy(false);
    if (outcome === "subscribed") setStatus("subscribed");
    else if (outcome === "denied") setStatus("denied");
  }

  return (
    <div className="alertBar" role="alert">
      <strong>⚠️ App non funzionante senza notifiche abilitate.</strong>{" "}
      ExecLingo nasce per darti un <strong>coach che ti scrive durante il giorno</strong> — senza notifiche il coach non può raggiungerti.
      {status === "need-install" ? (
        <span style={{ display: "block", marginTop: 4 }}>
          📲 Installa l&rsquo;app: tocca <strong>Condividi</strong> (il quadrato con la freccia ⬆️) → <strong>&ldquo;Aggiungi alla schermata Home&rdquo;</strong>, poi aprila dall&rsquo;icona: avrai lo schermo intero e potrai attivare le notifiche di Sam.
        </span>
      ) : null}
      {status === "need-enable" ? (
        <button type="button" className="primary" style={{ display: "block", marginTop: 8, padding: "9px 16px", minWidth: 0 }} disabled={busy} onClick={enable}>
          {busy ? "Attivo…" : "🔔 Attiva le notifiche ora"}
        </button>
      ) : null}
      {status === "denied" ? (
        <span style={{ display: "block", marginTop: 4 }}>
          Le notifiche sono bloccate: vai in <strong>Impostazioni → Notifiche → ExecLingo</strong> e consentile.
        </span>
      ) : null}
    </div>
  );
}

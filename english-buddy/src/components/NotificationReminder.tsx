"use client";

import { useEffect, useState } from "react";
import { getPushStatus, subscribeToPush, type PushStatus } from "@/lib/push-client";

/**
 * The invitation to switch notifications on, shown on every main screen until
 * they are.
 *
 * It used to open with "App non funzionante senza notifiche abilitate", which
 * was both untrue — everything works without them — and, testers reported,
 * the single biggest reason people left: the first thing the app told a new
 * arrival was that it was broken. Somebody who has just paid and wants to try
 * a conversation reads a red warning saying the product does not work and
 * closes it.
 *
 * The reason for asking has not changed, so neither has the ask. What changed
 * is that it now says what notifications give you rather than what the app
 * supposedly lacks without them.
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
    <div className="inviteBar" role="status">
      <strong>🔔 Attiva le notifiche: Sam ti accompagna.</strong>{" "}
      Ti scrive nei momenti giusti della giornata, ti ricorda i passaggi del percorso e non ti lascia perdere il filo. Bastano due minuti al giorno — decidi tu quando rispondere.
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

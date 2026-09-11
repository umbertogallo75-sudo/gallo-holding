"use client";

import { useState } from "react";
import { ConfirmPill } from "./ConfirmPill";

export function AdminActions({ userId, intensity, hasPush, hasFree }: { userId: string; intensity: string; hasPush: boolean; hasFree: boolean }) {
  const [free, setFree] = useState(hasFree);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tempCode, setTempCode] = useState("");

  async function call(body: Record<string, unknown>, okText: string): Promise<boolean> {
    setBusy(true); setStatus("");
    try {
      const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Errore");
      if (body.action === "resetcode" && data.tempCode) { setTempCode(String(data.tempCode)); setStatus(""); return true; }
      setStatus(body.action === "nudge" && data.delivered === 0 ? "Nessun dispositivo iscritto alle notifiche" : okText);
      return true;
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Errore");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function resetCode() {
    void call({ action: "resetcode", userId }, "");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <select className="field" style={{ margin: 0, padding: "6px 8px", width: "auto", fontSize: 13 }} defaultValue={intensity} disabled={busy}
          onChange={(e) => call({ action: "intensity", userId, intensity: e.target.value }, "Intensità aggiornata ✓")}>
          <option value="immersive">immersive</option>
          <option value="normal">normal</option>
          <option value="low">low</option>
        </select>
        <button className="pill" disabled={busy || !hasPush} title={hasPush ? "Invia una notifica di stimolo" : "Nessun dispositivo iscritto"}
          onClick={() => call({ action: "nudge", userId, message: message.trim() || undefined }, "Notifica inviata ✓")}>
          {busy ? "…" : "📣 Stimola"}
        </button>
        {userId !== "owner" ? (
          <ConfirmPill
            label="🔑 Reset codice"
            question="Il codice attuale smetterà di funzionare."
            title="Genera un codice temporaneo se l'utente ha perso il suo"
            disabled={busy}
            onConfirm={resetCode}
          />
        ) : null}
        {userId !== "owner" ? (
          <ConfirmPill
            label="🗑 Elimina"
            question="Elimina l'account e tutti i suoi dati. Non è reversibile."
            title="Elimina definitivamente l'account e tutti i suoi dati"
            danger
            disabled={busy}
            onConfirm={() => void call({ action: "deleteuser", userId }, "Utente eliminato ✓ (ricarica la pagina)")}
          />
        ) : null}
        {userId !== "owner" ? (
          <ConfirmPill
            label={free ? "🎁 Gratis ✓" : "🎁 Rendi gratis"}
            question={free ? "L'utente dovrà attivare un piano." : "Accesso completo, senza pagamento."}
            title={free ? "Questo utente usa l'app gratis: tocca per revocare" : "Concedi accesso completo gratuito (senza pagamento)"}
            disabled={busy}
            style={free ? { borderColor: "var(--accent)", fontWeight: 700 } : undefined}
            onConfirm={() => {
              const next = !free;
              void call({ action: "freeaccess", userId, grant: next }, next ? "Accesso gratuito attivato ✓" : "Accesso gratuito revocato ✓")
                .then((ok) => { if (ok) setFree(next); });
            }}
          />
        ) : null}
      </div>
      {tempCode ? (
        <div className="notice" style={{ marginTop: 4 }}>
          Codice temporaneo: <strong style={{ fontSize: 16, userSelect: "all" }}>{tempCode}</strong>
          <span className="itHint" style={{ display: "block" }}>Comunicaglielo tu (telefono/WhatsApp): entra con questo e poi lo cambia dal suo Profilo. Mostrato solo ora, non viene salvato in chiaro.</span>
        </div>
      ) : null}
      <input className="field" style={{ margin: 0, padding: "6px 8px", fontSize: 13 }} placeholder="Messaggio personalizzato (opzionale, in inglese)"
        value={message} onChange={(e) => setMessage(e.target.value)} />
      {status ? <span className="itHint">{status}</span> : null}
    </div>
  );
}

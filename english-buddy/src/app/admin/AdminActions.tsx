"use client";

import { useState } from "react";

export function AdminActions({ userId, intensity, hasPush }: { userId: string; intensity: string; hasPush: boolean }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function call(body: Record<string, unknown>, okText: string) {
    setBusy(true); setStatus("");
    try {
      const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Errore");
      setStatus(body.action === "nudge" && data.delivered === 0 ? "Nessun dispositivo iscritto alle notifiche" : okText);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
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
      </div>
      <input className="field" style={{ margin: 0, padding: "6px 8px", fontSize: 13 }} placeholder="Messaggio personalizzato (opzionale, in inglese)"
        value={message} onChange={(e) => setMessage(e.target.value)} />
      {status ? <span className="itHint">{status}</span> : null}
    </div>
  );
}

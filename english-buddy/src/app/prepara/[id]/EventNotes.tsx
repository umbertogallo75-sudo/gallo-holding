"use client";

import { useState } from "react";

/**
 * What the calendar does not know about this meeting.
 *
 * A calendar entry says "Call Northwind, 15:00". It does not say that the
 * price is the fight, that the person on the other side is impatient, or that
 * last time you could not explain the delay. That is what makes the difference
 * between a generic lesson and a useful one — and only the person going into
 * the room has it.
 */
export function EventNotes({ id, initial }: { id: string; initial: string }) {
  const [notes, setNotes] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true); setError(""); setSaved(false);
    try {
      const response = await fetch(`/api/events/${id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!response.ok) { setError("Non sono riuscito a salvare. Riprova."); return; }
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Connessione persa. Riprova.");
    } finally { setBusy(false); }
  }

  return (
    <section className="card">
      <div className="kicker">Cosa devi sapere tu</div>
      <p className="composerNote" style={{ marginTop: 4, marginBottom: 8 }}>
        Di cosa si parla, con chi, cosa vuoi ottenere, cosa temi ti chiedano. Sam ci prepara sopra la scheda.
      </p>
      <textarea
        className="eventNotes"
        aria-label="Note su questo impegno"
        placeholder="Es. Trattativa sul prezzo con il fornitore tedesco. Voglio tenere il prezzo e offrire un contratto più lungo. Temo mi chiedano una data di consegna che non posso garantire."
        value={notes}
        maxLength={2000}
        onChange={(event) => setNotes(event.target.value)}
      />
      <div className="aliasRow" style={{ marginTop: 10 }}>
        <button type="button" className="primary" disabled={busy} onClick={save}>
          {busy ? <><span className="navSpin" aria-hidden /> Salvo…</> : saved ? "✓ Salvato" : "Salva"}
        </button>
      </div>
      {error ? <div className="notice" style={{ marginTop: 10 }}>{error}</div> : null}
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Building the sheet, on demand rather than on arrival.
 *
 * An appointment imported from a calendar is a title and a time. Preparing
 * from that alone produces a sheet about meetings in general — so the sheet is
 * made when the person asks for it, after they have said what the meeting is
 * really about and attached the papers. Asking again once they add either is
 * the point of the button, not a repair.
 */
export function PrepareButton({ id, again }: { id: string; again: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function prepare() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/events/${id}/prepare`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Non ha funzionato."); return; }
      router.refresh();
    } catch {
      setError("Connessione persa. Riprova.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <button
        type="button"
        className={again ? "secondary full" : "primary full"}
        style={{ marginBottom: 12, minHeight: again ? undefined : 56, fontSize: again ? undefined : 17 }}
        disabled={busy}
        onClick={prepare}
      >
        {busy
          ? <><span className="navSpin" aria-hidden /> Sto preparando la scheda…</>
          : again ? "🔄 Rifai la scheda con quello che hai aggiunto" : "✨ Preparami per questo incontro"}
      </button>
      {error ? <div className="notice" style={{ marginBottom: 12 }}>{error}</div> : null}
    </>
  );
}

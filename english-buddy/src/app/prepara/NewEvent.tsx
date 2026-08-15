"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * One line and a date. Anything more would be a form to fill in before a
 * meeting, which is exactly what nobody does.
 */
export function NewEvent({ today }: { today: string }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading || title.trim().length < 4) return;
    setLoading(true);
    setError("");
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), date, time: time || null }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (response?.ok && data?.id) { router.push(`/prepara/${data.id}`); return; }
    setLoading(false);
    setError(data?.error ?? "Non riesco a preparare la scheda: riprova.");
  }

  return (
    <form onSubmit={submit}>
      <textarea
        className="field"
        rows={2}
        maxLength={200}
        placeholder="Call con il fornitore tedesco sul ritardo delle consegne"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ resize: "vertical", lineHeight: 1.5 }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input className="field" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} style={{ flex: 2 }} />
        <input className="field" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ flex: 1 }} />
      </div>
      <p className="itHint" style={{ margin: "6px 4px 10px" }}>
        L&rsquo;ora è facoltativa. Il giorno prima Sam ti scrive per ripassare.
      </p>
      <button className="primary full" disabled={loading || title.trim().length < 4}>
        {loading ? "Sam sta preparando la scheda…" : "Preparami"}
      </button>
      {error ? <p className="warnText" style={{ margin: "10px 4px 0" }}>{error}</p> : null}
    </form>
  );
}

"use client";

import { FormEvent, useState } from "react";
import { Copy } from "@/components/Copy";
import { Speak } from "@/components/Speak";

type Debrief = { feedback: string; phrases: { english: string; italian: string }[] };

/**
 * Two minutes, asked the same evening. The second field is the one that
 * matters — what they could not say — but it is optional, because somebody
 * who has just come out of a hard meeting will not fill in a form.
 */
export function DebriefForm({ eventId, existing }: { eventId: string; existing: Debrief | null }) {
  const [howItWent, setHowItWent] = useState("");
  const [missing, setMissing] = useState("");
  const [result, setResult] = useState<Debrief | null>(existing);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading || howItWent.trim().length < 3) return;
    setLoading(true);
    setError("");
    const response = await fetch("/api/events/debrief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: eventId, howItWent: howItWent.trim(), missing: missing.trim() || undefined }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setLoading(false);
    if (!response?.ok) { setError(data?.error ?? "Non riesco a elaborarlo: riprova."); return; }
    setResult(data as Debrief);
  }

  if (result) {
    return (
      <>
        <p className="muted" style={{ whiteSpace: "pre-line", marginTop: 0 }}>{result.feedback}</p>
        <div className="kicker" style={{ marginTop: 14 }}>Per la prossima volta</div>
        {result.phrases.map((phrase, index) => (
          <div key={index} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: "11px 0", borderBottom: index === result.phrases.length - 1 ? "none" : "1px solid var(--line)" }}>
            <div>
              <strong style={{ fontSize: 16, lineHeight: 1.35 }}>{phrase.english}</strong>
              <div className="muted" style={{ fontSize: 14.5 }}>{phrase.italian}</div>
            </div>
            <span style={{ display: "flex", gap: 4, flexShrink: 0 }}><Speak text={phrase.english} compact /><Copy text={phrase.english} /></span>
          </div>
        ))}
        <p className="itHint" style={{ margin: "10px 0 0" }}>Sono già nel tuo frasario: Sam te le riproporrà nei prossimi giorni.</p>
      </>
    );
  }

  return (
    <form onSubmit={submit}>
      <label className="itHint" style={{ display: "block", margin: "0 4px 4px" }}>Com&rsquo;è andata?</label>
      <textarea
        className="field"
        rows={2}
        maxLength={600}
        placeholder="Bene sul prezzo, ma sono andato in difficoltà quando hanno insistito sui tempi"
        value={howItWent}
        onChange={(e) => setHowItWent(e.target.value)}
        style={{ resize: "vertical", lineHeight: 1.5 }}
      />
      <label className="itHint" style={{ display: "block", margin: "10px 4px 4px" }}>Cosa non sei riuscito a dire? <span style={{ opacity: 0.7 }}>(facoltativo)</span></label>
      <textarea
        className="field"
        rows={2}
        maxLength={600}
        placeholder="Volevo dire che accettiamo solo con una penale, ma non mi è uscito"
        value={missing}
        onChange={(e) => setMissing(e.target.value)}
        style={{ resize: "vertical", lineHeight: 1.5 }}
      />
      <button className="primary full" disabled={loading || howItWent.trim().length < 3} style={{ marginTop: 10 }}>
        {loading ? "Sam ci pensa…" : "Chiudi il debrief"}
      </button>
      {error ? <p className="warnText" style={{ margin: "10px 4px 0" }}>{error}</p> : null}
    </form>
  );
}

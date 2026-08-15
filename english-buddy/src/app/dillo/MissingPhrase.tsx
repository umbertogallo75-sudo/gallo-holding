"use client";

import { FormEvent, useState } from "react";
import { Speak } from "@/components/Speak";

type Alternative = { english: string; tone: string };
type Result = { english: string; italian: string; note: string; alternatives: Alternative[] };

/**
 * The phrase you couldn't say. Write it in Italian, get the English back.
 *
 * Deliberately one field and one button: it is used in the ninety seconds
 * after a call, or under the table during one. No dictation button either —
 * every phone keyboard already has a microphone, and one less thing to learn
 * is worth more than one more thing to tap.
 */
export function MissingPhrase() {
  const [italian, setItalian] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = italian.trim();
    if (text.length < 2 || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    const response = await fetch("/api/missing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ italian: text }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setLoading(false);
    if (!response?.ok) {
      setError(data?.error ?? "Non riesco a rispondere: riprova.");
      return;
    }
    setResult(data as Result);
  }

  function again() {
    setResult(null);
    setItalian("");
    setError("");
  }

  return (
    <>
      <form onSubmit={submit}>
        <textarea
          className="field"
          rows={3}
          maxLength={400}
          autoFocus
          placeholder="Volevo dire che non possiamo accettare quei tempi di consegna…"
          value={italian}
          onChange={(e) => setItalian(e.target.value)}
          style={{ resize: "vertical", lineHeight: 1.5 }}
        />
        <p className="itHint" style={{ margin: "6px 4px 10px" }}>
          🎙️ Scrivilo in italiano, oppure detta usando il microfono della tastiera.
        </p>
        <button className="primary full" disabled={loading || italian.trim().length < 2}>
          {loading ? "Sam ci pensa…" : "Come si dice in inglese"}
        </button>
      </form>

      {error ? <p className="warnText" style={{ margin: "12px 4px 0" }}>{error}</p> : null}

      {result ? (
        <>
          <section className="card" style={{ marginTop: 14, borderColor: "color-mix(in srgb, var(--accent) 55%, var(--line))" }}>
            <div className="kicker">Dillo così</div>
            <h2 style={{ margin: "6px 0 4px", lineHeight: 1.3 }}>{result.english}</h2>
            <Speak text={result.english} />
            <p className="muted" style={{ marginBottom: 0 }}>{result.italian}</p>
            {result.note ? <p className="itHint" style={{ marginTop: 8 }}>{result.note}</p> : null}
          </section>

          {result.alternatives.length ? (
            <section className="card">
              <div className="kicker">Se serve un altro tono</div>
              {result.alternatives.map((alt, index) => (
                <div key={index} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: "10px 0", borderBottom: index === result.alternatives.length - 1 ? "none" : "1px solid var(--line)" }}>
                  <div>
                    <strong style={{ fontSize: 16 }}>{alt.english}</strong>
                    <div className="itHint">{alt.tone}</div>
                  </div>
                  <Speak text={alt.english} compact />
                </div>
              ))}
            </section>
          ) : null}

          <p className="itHint" style={{ margin: "0 4px 12px", textAlign: "center" }}>
            ✅ Salvata nel tuo <a href="/phrasebook">frasario</a>: Sam te la riproporrà finché non ti verrà da sola.
          </p>
          <button type="button" className="secondary full" onClick={again}>Un&rsquo;altra frase</button>
        </>
      ) : null}
    </>
  );
}

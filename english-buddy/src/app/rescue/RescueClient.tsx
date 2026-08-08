"use client";

import { useState } from "react";
import Link from "next/link";
import { Speak } from "@/components/Speak";

type RescueResult = { simple: string; natural: string; business: string };

const REGISTERS: { key: keyof RescueResult; label: string; it: string }[] = [
  { key: "simple", label: "SIMPLE", it: "Facile da dire subito" },
  { key: "natural", label: "NATURAL", it: "Come lo direbbe un madrelingua" },
  { key: "business", label: "BUSINESS", it: "Registro professionale" },
];

export function RescueClient({ beginner }: { beginner: boolean }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<RescueResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [copied, setCopied] = useState("");

  // Beginners see SIMPLE first; confident users see NATURAL/BUSINESS first.
  const order = beginner ? REGISTERS : [REGISTERS[1], REGISTERS[2], REGISTERS[0]];

  async function translate() {
    if (!text.trim() || loading) return;
    setLoading(true); setError(""); setResult(null); setSaved([]); setCopied("");
    try {
      const r = await fetch("/api/rescue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Unavailable");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rescue is temporarily unavailable");
    } finally {
      setLoading(false);
    }
  }

  async function copy(sentence: string) {
    try { await navigator.clipboard.writeText(sentence); setCopied(sentence); } catch { /* clipboard unavailable */ }
  }

  async function save(sentence: string) {
    try {
      const r = await fetch("/api/rescue", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expression: sentence, meaning: text.slice(0, 300) }) });
      if (r.ok) setSaved((v) => [...v, sentence]);
    } catch { /* stays unsaved */ }
  }

  return (
    <>
      <textarea
        className="field" rows={3}
        placeholder="Scrivi in italiano cosa vuoi dire… — e.g. Vorrei dire che non sono d'accordo sulla valutazione della società."
        value={text} onChange={(e) => setText(e.target.value)}
      />
      <button className="primary full" disabled={loading || !text.trim()} onClick={translate}>
        {loading ? "Translating…" : "Help me say it in English"}
      </button>
      {error ? <div className="notice" style={{ marginTop: 10 }}>{error}</div> : null}
      {result ? order.map(({ key, label, it }) => {
        const sentence = result[key];
        return (
          <section className="card" key={key}>
            <div className="kicker">{label}</div>
            <p style={{ margin: "8px 0 4px", fontWeight: 650 }}>{sentence}</p>
            <p className="itHint">{it}</p>
            <div className="rescueActions">
              <Speak text={sentence} compact />
              <button type="button" className="pill" onClick={() => copy(sentence)}>{copied === sentence ? "Copied ✓" : "Copy"}</button>
              <button type="button" className="pill" disabled={saved.includes(sentence)} onClick={() => save(sentence)}>{saved.includes(sentence) ? "Saved ✓" : "Save for review"}</button>
              <Link className="pill" href={`/buddy?mode=text-2&q=${encodeURIComponent(`Let's practice this sentence: "${sentence}". Try saying it to me in your own words.`)}`}>Practice</Link>
            </div>
          </section>
        );
      }) : null}
    </>
  );
}

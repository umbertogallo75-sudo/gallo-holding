"use client";

import { FormEvent, useEffect, useState } from "react";
import { Copy } from "@/components/Copy";

/**
 * The screen you keep beside the laptop while the meeting is happening.
 *
 * Everything here is built around one constraint: during a call you have two
 * seconds and one thumb. The lifelines are written in, not generated, so they
 * appear instantly — a model call would arrive after the moment has passed.
 * Only the free-text lookup waits on the network, because it has to.
 */

type Phrase = { english: string; italian: string; use: string };

const LIFELINES: { key: string; label: string; icon: string; lines: string[] }[] = [
  {
    key: "repeat",
    label: "Fammi ripetere",
    icon: "🔁",
    lines: [
      "Sorry, could you say that again?",
      "Could you slow down a little, please?",
      "I didn't catch the last part.",
      "Just to make sure I understood — you're saying…",
    ],
  },
  {
    key: "time",
    label: "Prendo tempo",
    icon: "⏳",
    lines: [
      "Let me think about that for a second.",
      "That's a fair question — give me a moment.",
      "Can I come back to you on that?",
      "I'd rather check before I answer.",
    ],
  },
  {
    key: "disagree",
    label: "Non sono d'accordo",
    icon: "✋",
    lines: [
      "I see it differently.",
      "I'm not comfortable with that.",
      "That doesn't work for us, I'm afraid.",
      "I understand, but we can't go that far.",
    ],
  },
  {
    key: "close",
    label: "Chiudo il punto",
    icon: "✅",
    lines: [
      "So, to sum up…",
      "Let's park that and come back to it.",
      "Can we agree on the next steps?",
      "I'll follow up with an email today.",
    ],
  },
];

export function MeetingClient({ phrases, title }: { phrases: Phrase[]; title: string | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ natural: string; business: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // A meeting lasts longer than the screen timeout, and nobody wants to unlock
  // their phone mid-sentence.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as unknown as { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((sentinel) => { lock = sentinel; }).catch(() => undefined);
    return () => { void lock?.release().catch(() => undefined); };
  }, []);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (text.length < 2 || loading) return;
    setLoading(true);
    setAnswer(null);
    const response = await fetch("/api/rescue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setLoading(false);
    if (response?.ok && data?.business) setAnswer({ natural: data.natural, business: data.business });
  }

  return (
    <>
      <section className="card">
        <div className="kicker">Se ti blocchi</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
          {LIFELINES.map((lifeline) => (
            <button
              key={lifeline.key}
              type="button"
              className={open === lifeline.key ? "primary" : "secondary"}
              style={{ padding: "16px 8px", fontSize: 15, lineHeight: 1.3 }}
              onClick={() => setOpen(open === lifeline.key ? null : lifeline.key)}
            >
              <span style={{ fontSize: 20, display: "block" }}>{lifeline.icon}</span>
              {lifeline.label}
            </button>
          ))}
        </div>
        {open ? (
          <div style={{ marginTop: 12 }}>
            {LIFELINES.find((l) => l.key === open)?.lines.map((line, index) => (
              <div key={index} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, margin: "0 0 12px" }}>
                <p style={{ fontSize: 19, lineHeight: 1.4, margin: 0, fontWeight: 600 }}>{line}</p>
                <Copy text={line} />
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="kicker">Come si dice…</div>
        <form onSubmit={ask} style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            className="field"
            placeholder="non possiamo accettare quei tempi"
            value={question}
            maxLength={200}
            onChange={(e) => setQuestion(e.target.value)}
            style={{ flex: 1, fontSize: 16 }}
          />
          <button className="primary" disabled={loading || question.trim().length < 2} style={{ whiteSpace: "nowrap" }}>
            {loading ? "…" : "Dimmi"}
          </button>
        </form>
        {answer ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <p style={{ fontSize: 20, lineHeight: 1.4, margin: "0 0 6px", fontWeight: 700 }}>{answer.business}</p>
              <Copy text={answer.business} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <p className="muted" style={{ fontSize: 16, margin: 0 }}>{answer.natural}</p>
              <Copy text={answer.natural} />
            </div>
          </div>
        ) : null}
      </section>

      {phrases.length ? (
        <section className="card">
          <div className="kicker">{title ? `Per: ${title}` : "Le tue frasi"}</div>
          {phrases.map((phrase, index) => (
            <div key={index} style={{ padding: "12px 0", borderBottom: index === phrases.length - 1 ? "none" : "1px solid var(--line)" }}>
              <div className="itHint" style={{ marginBottom: 2 }}>{phrase.use}</div>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <p style={{ fontSize: 18, lineHeight: 1.4, margin: 0, fontWeight: 600 }}>{phrase.english}</p>
                <Copy text={phrase.english} />
              </div>
              <p className="muted" style={{ fontSize: 14.5, margin: "2px 0 0" }}>{phrase.italian}</p>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}

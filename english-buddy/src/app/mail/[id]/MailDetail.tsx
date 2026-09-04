"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Speak } from "@/components/Speak";
import type { MailItem } from "@/lib/mail/store";

const TONE_LABELS: { key: "firm" | "soft" | "short"; label: string }[] = [
  { key: "firm", label: "Più decisa" },
  { key: "soft", label: "Più morbida" },
  { key: "short", label: "Più corta" },
];

/**
 * One forwarded email, and what to do about it.
 *
 * The order is the order of the panic: what does this say, what do they want
 * from me, what do I send back. The reply is the only thing with a big button
 * on it, because copying it is why anybody forwarded the message in the first
 * place — and it is placed to be copied and pasted into their own mail client,
 * not sent from here, since the conversation belongs in their mailbox.
 */
export function MailDetail({ item }: { item: MailItem }) {
  const router = useRouter();
  const [reply, setReply] = useState(item.replyEn);
  const [summary, setSummary] = useState(item.summaryIt);
  const [asks, setAsks] = useState(item.asks);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [trusted, setTrusted] = useState(item.senderKnown);
  const [original, setOriginal] = useState(false);

  async function act(action: "retry" | "tone" | "instruct", extra: Record<string, string> = {}, label = "") {
    setBusy(label || action); setError("");
    try {
      const response = await fetch(`/api/mail/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Non ha funzionato."); return; }
      if (data.reply) setReply(data.reply);
      if (data.summaryIt) setSummary(data.summaryIt);
      if (Array.isArray(data.asks)) setAsks(data.asks);
      setInstruction("");
    } catch {
      setError("Connessione persa. Riprova.");
    } finally { setBusy(""); }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(reply);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { setError("Il telefono non ha permesso la copia: tieni premuto sul testo e copia a mano."); }
  }

  async function trust() {
    setTrusted(true);
    await fetch(`/api/mail/${item.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "trust" }),
    }).catch(() => null);
  }

  async function remove() {
    await fetch(`/api/mail/${item.id}`, { method: "DELETE" }).catch(() => null);
    router.push("/mail");
    router.refresh();
  }

  if (item.status !== "ready" && !reply) {
    return (
      <section className="card" style={{ textAlign: "center", padding: 26 }}>
        <h2 style={{ marginTop: 0 }}>{item.status === "failed" ? "Non sono riuscito a leggerla" : "Ci sto lavorando"}</h2>
        <p className="muted">
          {item.status === "failed"
            ? "Qualcosa è andato storto mentre la preparavo. Riprovo subito, se vuoi."
            : "Ancora un momento e trovi qui riassunto e risposta."}
        </p>
        {error ? <div className="notice" style={{ margin: "10px 0" }}>{error}</div> : null}
        <button className="primary full" disabled={busy === "retry"} onClick={() => act("retry")}>
          {busy === "retry" ? "Un attimo…" : "Riprova"}
        </button>
      </section>
    );
  }

  return (
    <>
      <section className="card">
        <div className="kicker">Da</div>
        <h2 style={{ margin: "4px 0 2px" }}>{item.counterpart || item.fromName || item.fromAddress}</h2>
        <p className="composerNote" style={{ marginTop: 0 }}>{item.subject || "(senza oggetto)"}</p>
        {!trusted && item.fromAddress ? (
          <div className="notice" style={{ marginTop: 10 }}>
            Questa è arrivata da <strong>{item.fromAddress}</strong>, un indirizzo che non conoscevo.
            <button type="button" className="secondary full" style={{ marginTop: 8 }} onClick={trust}>
              È mio — riconoscilo d&rsquo;ora in poi
            </button>
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="kicker">Cosa dice</div>
        <p style={{ marginBottom: asks.length ? 14 : 0 }}>{summary}</p>
        {asks.length ? (
          <>
            <div className="kicker">Cosa ti chiedono</div>
            <ul className="mailAsks">
              {asks.map((ask) => <li key={ask}>{ask}</li>)}
            </ul>
          </>
        ) : null}
      </section>

      <section className="card">
        <div className="kicker">La tua risposta</div>
        <p className="mailReply">{reply}</p>
        <div className="aliasRow" style={{ marginTop: 12 }}>
          <button type="button" className="primary" onClick={copy}>{copied ? "✓ Copiata" : "📋 Copia la risposta"}</button>
          <Speak text={reply} compact />
        </div>

        <div className="kicker" style={{ marginTop: 18 }}>Cambia tono</div>
        <div className="mailTones">
          {TONE_LABELS.map((tone) => (
            <button
              key={tone.key}
              type="button"
              className="pill"
              disabled={Boolean(busy)}
              onClick={() => act("tone", { tone: tone.key }, tone.key)}
            >
              {busy === tone.key ? "…" : tone.label}
            </button>
          ))}
        </div>

        <div className="kicker" style={{ marginTop: 18 }}>Oppure dillo a Sam</div>
        <form
          className="mailInstruct"
          onSubmit={(event) => { event.preventDefault(); if (instruction.trim()) void act("instruct", { instruction: instruction.trim() }); }}
        >
          <textarea
            aria-label="Cosa vuoi rispondere"
            placeholder="Es. digli che non possiamo prima di lunedì e chiedi il prezzo aggiornato"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            maxLength={400}
          />
          <button className="primary" disabled={!instruction.trim() || Boolean(busy)}>
            {busy === "instruct" ? "…" : "Riscrivi"}
          </button>
        </form>
        {error ? <div className="notice" style={{ marginTop: 10 }}>{error}</div> : null}
      </section>

      {item.expressions.length ? (
        <section className="card">
          <div className="kicker">Da tenere</div>
          {item.expressions.map((expression) => (
            <div key={expression.expression} className="keepRow" style={{ marginTop: 8 }}>
              <strong>{expression.expression}</strong>
              <Speak text={expression.expression} compact />
              {expression.meaning ? <p className="keepNote" style={{ width: "100%", margin: "2px 0 0" }}>{expression.meaning}</p> : null}
            </div>
          ))}
        </section>
      ) : null}

      {item.bodyText ? (
        <section className="card">
          <button type="button" className="mailOriginalToggle" onClick={() => setOriginal(!original)}>
            {original ? "Nascondi il testo originale" : "Mostra il testo originale"}
          </button>
          {original ? <pre className="mailOriginal">{item.bodyText}</pre> : null}
        </section>
      ) : null}

      <button type="button" className="secondary full" onClick={remove} style={{ marginBottom: 10 }}>
        Elimina questa mail
      </button>
    </>
  );
}

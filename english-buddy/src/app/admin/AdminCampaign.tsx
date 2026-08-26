"use client";

import { useState } from "react";

const SEGMENTS = [
  { value: "lapsed", label: "Inattivi da 7+ giorni" },
  { value: "no_plan", label: "Senza piano attivo" },
  { value: "trial_done", label: "Hanno finito la prova gratuita" },
  { value: "paying", label: "Clienti paganti" },
  { value: "all", label: "Tutti gli iscritti" },
];

/**
 * Owner-written campaigns. The count comes first and the send second, on
 * purpose: the only irreversible thing on this page is an email that has
 * already left.
 */
export function AdminCampaign({ from, replyTo, startsOn, ready: configured }: { from: string; replyTo: string | null; startsOn: string; ready: boolean }) {
  const [segment, setSegment] = useState("lapsed");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [audience, setAudience] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(campaignId?: string) {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Counting asks about the segment only. Sending carries the letter.
        body: JSON.stringify(
          campaignId
            ? { action: "campaign", segment, subject, body, ctaLabel: ctaLabel || undefined, ctaUrl: ctaUrl || undefined, campaignId }
            : { action: "campaign", segment }
        ),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Errore");
      if (data.preview) {
        setAudience(data.audience);
        setStatus(`${data.audience} destinatari in «${data.segment}», disiscritti già esclusi.`);
      } else {
        setAudience(null);
        setStatus(`Inviate ${data.sent} email · ${data.skipped} saltate (già ricevute o disiscritte).`);
        setSubject(""); setBody(""); setCtaLabel(""); setCtaUrl("");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  function send() {
    if (audience === null) return;
    if (!window.confirm(`Inviare a ${audience} persone? Le email partite non si possono richiamare.`)) return;
    // Identifies this campaign so a second click cannot write to anyone twice.
    void call(`c${Date.now().toString(36)}`);
  }

  const ready = subject.trim().length >= 3 && body.trim().length >= 10;

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>✉️ Invia una campagna</h2>
      <p className="itHint" style={{ marginTop: 0 }}>
        Stessa grafica delle altre email, con il link di disiscrizione già in fondo. Chi si è disiscritto non viene mai raggiunto, nemmeno da qui.
      </p>
      {!configured ? (
        <div className="notice" style={{ marginBottom: 10 }}>⚠️ Nessuna chiave email configurata: gli invii non partono. Manca <code>RESEND_API_KEY</code>.</div>
      ) : from.includes("resend.dev") ? (
        <div className="notice" style={{ marginBottom: 10 }}>
          ⚠️ Le email partono da <code>{from}</code>, il dominio di prova del fornitore. Una campagna spedita da lì finisce in spam quasi sempre. Imposta <code>EMAIL_FROM</code> con un indirizzo del dominio execlingo.it verificato su Resend.
        </div>
      ) : (
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
          Mittente: <code>{from}</code>
          {replyTo ? <> · le risposte arrivano a <code>{replyTo}</code></> : <> · <strong>le risposte si perdono</strong>: imposta <code>EMAIL_REPLY_TO</code></>}
        </p>
      )}

      <label className="kicker" htmlFor="seg">A chi</label>
      <select id="seg" className="field" value={segment} onChange={(e) => { setSegment(e.target.value); setAudience(null); setStatus(""); }}>
        {SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>

      <label className="kicker" htmlFor="subj">Oggetto</label>
      <input id="subj" className="field" value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} placeholder="Una novità per te" />

      <label className="kicker" htmlFor="body">Testo — una riga vuota separa i paragrafi</label>
      <textarea id="body" className="field" rows={7} value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} placeholder={"Ciao,\n\nabbiamo appena aggiunto..."} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 10 }}>
        <input className="field" value={ctaLabel} maxLength={40} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Pulsante (facoltativo)" />
        <input className="field" value={ctaUrl} maxLength={300} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://www.execlingo.it/…" />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button className="secondary" disabled={busy} onClick={() => void call()}>{busy ? "…" : "Quanti sono?"}</button>
        <button className="primary" disabled={busy || !ready || audience === null} onClick={send}>
          {busy ? "…" : audience === null ? "Prima conta i destinatari" : `Invia a ${audience}`}
        </button>
      </div>
      {status ? <div className="notice" style={{ marginTop: 12 }}>{status}</div> : null}
      <p className="itHint" style={{ marginBottom: 0 }}>
        Le email automatiche (benvenuto, prova, riepilogo della sera, solleciti) partono dal <strong>{startsOn}</strong>. Il silenzio si conta da quella data, così nessuno riceve la lettera dura come primo contatto. Le campagne scritte qui partono invece subito.
      </p>
    </section>
  );
}

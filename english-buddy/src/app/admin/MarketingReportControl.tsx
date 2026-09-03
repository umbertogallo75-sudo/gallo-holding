"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type ReportResponse = {
  ok?: boolean;
  reused?: boolean;
  status?: "success" | "partial";
  emailSent?: boolean;
  emailRequested?: boolean;
  completedAt?: string | null;
  error?: string;
};

function completedLabel(value?: string | null) {
  if (!value) return "adesso";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "adesso";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(date);
}

/** Manual, cloud-side reporting control available on every Admin tab. */
export function MarketingReportControl() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "warn" | "error">("ok");
  const [activeAction, setActiveAction] = useState<"refresh" | "email" | null>(null);
  const requestInFlight = useRef(false);

  async function refreshReport(sendEmail: boolean) {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    setActiveAction(sendEmail ? "email" : "refresh");
    setMessage("Collegamento alle piattaforme e raccolta dei dati in corso…");
    setTone("ok");
    try {
      const response = await fetch("/api/admin/marketing-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendEmail }),
      });
      const data = await response.json().catch(() => ({})) as ReportResponse;
      if (!response.ok) throw new Error(data.error || "Aggiornamento non riuscito.");

      const when = completedLabel(data.completedAt);
      const reused = data.reused ? " Il doppio avvio è stato ignorato." : "";
      if (!sendEmail) {
        setTone(data.status === "partial" ? "warn" : "ok");
        setMessage(`Dashboard aggiornata il ${when}. Nessuna email inviata.${reused}`);
      } else if (data.emailSent) {
        setTone(data.status === "partial" ? "warn" : "ok");
        setMessage(`Dashboard aggiornata il ${when} e report inviato via email.${reused}`);
      } else {
        setTone("warn");
        setMessage(`Dashboard aggiornata il ${when}, ma l'email non è partita. I dati restano disponibili qui.${reused}`);
      }
      router.refresh();
    } catch (error) {
      setTone("error");
      setMessage(error instanceof Error ? error.message : "Aggiornamento non riuscito.");
    } finally {
      requestInFlight.current = false;
      setBusy(false);
      setActiveAction(null);
    }
  }

  return (
    <section className="adminReportControl" aria-label="Aggiornamento report performance" aria-busy={busy}>
      <div className="adminReportIntro">
        <strong>Report performance</strong>
        <span>Aggiorna i dati dal cloud; l&apos;email parte soltanto se scegli il secondo pulsante.</span>
        {message ? <small className={`adminReportMessage adminReportMessage-${tone}`} role="status" aria-live="polite">{message}</small> : null}
      </div>
      <div className="adminReportActions">
        <button className="primary adminReportButton" type="button" disabled={busy} onClick={() => void refreshReport(false)}>
          {busy && activeAction === "refresh" ? "Aggiornamento in corso…" : "↻ Aggiorna dati"}
        </button>
        <button className="secondary adminReportButton" type="button" disabled={busy} onClick={() => void refreshReport(true)}>
          {busy && activeAction === "email" ? "Invio in corso…" : "Aggiorna e invia email"}
        </button>
      </div>
    </section>
  );
}

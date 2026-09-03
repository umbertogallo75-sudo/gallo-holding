"use client";

import { useRef, useState } from "react";

type PreflightIssue = {
  code?: unknown;
  message?: unknown;
  fieldPath?: unknown;
};

type PreflightResponse = {
  ok?: boolean;
  status?: "valid" | "invalid" | "not_configured" | "error";
  detail?: string;
  issues?: PreflightIssue[];
  error?: string;
};

type VisibleIssue = {
  code: string;
  message: string;
  fieldPath: string | null;
};

function boundedText(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

/** Bounds provider diagnostics again before rendering them in ADMIN. */
export function visiblePreflightIssues(value: unknown): VisibleIssue[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).map((issue) => {
    const record = typeof issue === "object" && issue !== null
      ? issue as PreflightIssue
      : {};
    const fieldPath = typeof record.fieldPath === "string" && record.fieldPath.trim()
      ? record.fieldPath.trim().slice(0, 180)
      : null;
    return {
      code: boundedText(record.code, "GOOGLE_ADS_ERROR", 100),
      message: boundedText(record.message, "Configurazione non valida.", 400),
      fieldPath,
    };
  });
}

/** Read-only ADMIN control: this never creates or enables a campaign. */
export function GoogleAdsAppPreflightControl() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "warn" | "error">("ok");
  const [issues, setIssues] = useState<VisibleIssue[]>([]);
  const requestInFlight = useRef(false);

  async function runPreflight() {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    setTone("ok");
    setMessage("Google Ads sta controllando app, targeting, budget e annunci…");
    setIssues([]);

    try {
      const response = await fetch("/api/admin/google-ads/app-preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await response.json().catch(() => ({})) as PreflightResponse;
      const visibleIssues = visiblePreflightIssues(data.issues);
      setIssues(visibleIssues);

      if (data.status === "valid" && response.ok) {
        setTone("ok");
        setMessage(data.detail || "Configurazione valida. Nessuna campagna o spesa è stata creata.");
        return;
      }

      if (data.status === "invalid") {
        setTone("warn");
        setMessage(data.detail || "Google Ads ha indicato elementi da correggere. Nessuna campagna o spesa è stata creata.");
        return;
      }

      setTone("error");
      setMessage(data.detail || data.error || "Controllo non riuscito. Nessuna campagna o spesa è stata creata.");
    } catch {
      setTone("error");
      setMessage("Controllo non raggiungibile. Nessuna campagna o spesa è stata creata.");
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="adminReportControl adminAppPreflightControl" aria-label="Verifica campagna Android" aria-busy={busy}>
      <div>
        <strong>Campagna Android</strong>
        <span>Solo controllo: non crea campagne, non modifica budget e non attiva spesa.</span>
        <span>Il test iniziale potrà ottimizzare solo le installazioni Play; servirà il sign_up nativo prima di ottimizzare le registrazioni.</span>
        {message ? (
          <small className={`adminReportMessage adminReportMessage-${tone}`} role="status" aria-live="polite">
            {message}
          </small>
        ) : null}
        {issues.length > 0 ? (
          <ol className="adminAppPreflightIssues" aria-label="Problemi rilevati">
            {issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>
                <strong>{issue.code}</strong>: {issue.message}
                {issue.fieldPath ? <small>Campo: {issue.fieldPath}</small> : null}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      <button className="secondary adminReportButton" type="button" disabled={busy} onClick={() => void runPreflight()}>
        {busy ? "Verifica in corso…" : "Verifica campagna Android"}
      </button>
    </section>
  );
}

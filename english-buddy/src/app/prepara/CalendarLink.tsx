"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Connecting a calendar, in the only way that works for everybody.
 *
 * Every calendar — iCloud, Google, Outlook — can publish itself at a private
 * address. Asking for that address instead of for an account is the
 * difference between working today and waiting weeks for a verification
 * queue, and it means we never hold the keys to anybody's calendar: only a
 * link they can revoke from their own settings whenever they like.
 *
 * The instructions are on the screen because nobody knows where that setting
 * is, and a feature you cannot find the first step of does not exist.
 */
const HOW = [
  { app: "iPhone / iCloud", steps: "Su iCloud.com apri Calendario, tocca l'icona ✓ accanto al nome del calendario, attiva «Calendario pubblico» e copia l'indirizzo." },
  { app: "Google Calendar", steps: "Impostazioni → scegli il calendario → «Integra il calendario» → copia l'«Indirizzo segreto in formato iCal»." },
  { app: "Outlook / Microsoft 365", steps: "Impostazioni → Calendario → Calendari condivisi → Pubblica un calendario → scegli «Tutti i dettagli» e copia il link ICS." },
];

export function CalendarLink({ connected, lastSync, lastError }: { connected: boolean; lastSync: string | null; lastError: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(lastError ?? "");
  const [done, setDone] = useState("");
  const [open, setOpen] = useState(false);

  async function call(action: "connect" | "sync" | "disconnect") {
    setBusy(action); setError(""); setDone("");
    try {
      const response = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          url: action === "connect" ? url.trim() : undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Non ha funzionato."); return; }
      if (action !== "disconnect") {
        const found = (data.imported ?? 0) + (data.updated ?? 0);
        setDone(found ? `${found} impegni letti dal calendario.` : "Calendario letto: nei prossimi giorni non c'è niente.");
      }
      setUrl("");
      router.refresh();
    } catch {
      setError("Connessione persa. Riprova.");
    } finally { setBusy(""); }
  }

  if (connected) {
    return (
      <section className="card">
        <div className="kicker">Calendario collegato</div>
        <p className="composerNote" style={{ marginTop: 4 }}>
          {lastSync ? `Ultima lettura: ${new Date(lastSync).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : "Non ancora letto."}
          {" "}Gli impegni dei prossimi giorni arrivano qui da soli.
        </p>
        {error ? <div className="notice" style={{ margin: "10px 0" }}>{error}</div> : null}
        {done ? <div className="notice" style={{ margin: "10px 0" }}>{done}</div> : null}
        <div className="aliasRow" style={{ marginTop: 10 }}>
          <button type="button" className="primary" disabled={Boolean(busy)} onClick={() => call("sync")}>
            {busy === "sync" ? <><span className="navSpin" aria-hidden /> Leggo…</> : "🔄 Aggiorna adesso"}
          </button>
          <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => call("disconnect")}>
            {busy === "disconnect" ? <span className="navSpin" aria-hidden /> : "Scollega"}
          </button>
        </div>
        <p className="composerNote" style={{ marginTop: 10 }}>
          Scollegando, spariscono gli impegni importati. Quelli che hai scritto tu restano.
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="kicker">Collega il calendario</div>
      <p style={{ margin: "6px 0 12px" }}>
        Incolla l&rsquo;<strong>indirizzo privato</strong> del tuo calendario e Sam vedrà da solo le call che hai in arrivo,
        senza che tu debba scrivere niente. Sola lettura, e lo scolleghi quando vuoi.
      </p>
      <input
        className="linkInput"
        type="url"
        inputMode="url"
        placeholder="https://… .ics"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        aria-label="Indirizzo del calendario"
      />
      <button
        type="button"
        className="primary full"
        style={{ marginTop: 10 }}
        disabled={!url.trim() || Boolean(busy)}
        onClick={() => call("connect")}
      >
        {busy === "connect" ? <><span className="navSpin" aria-hidden /> Collego…</> : "Collega"}
      </button>
      {error ? <div className="notice" style={{ marginTop: 10 }}>{error}</div> : null}

      <button type="button" className="mailOriginalToggle" style={{ marginTop: 12 }} onClick={() => setOpen(!open)}>
        {open ? "Nascondi le istruzioni" : "Dove trovo quell'indirizzo?"}
      </button>
      {open ? (
        <div style={{ marginTop: 8 }}>
          {HOW.map((how) => (
            <p key={how.app} className="composerNote" style={{ marginBottom: 8 }}>
              <strong>{how.app}</strong><br />{how.steps}
            </p>
          ))}
          <p className="composerNote">
            🔒 È un indirizzo segreto: chi ce l&rsquo;ha vede i tuoi impegni. Non condividerlo, e se lo perdi
            rigeneralo dalle impostazioni del tuo calendario.
          </p>
        </div>
      ) : null}
    </section>
  );
}

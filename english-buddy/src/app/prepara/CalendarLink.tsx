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
/**
 * The three places that address lives, and a way straight to each.
 *
 * Nobody knows where "publish this calendar" is in their own calendar app,
 * and the honest reason this step is manual at all is that Apple offers no
 * other way in — so the least we can do is open the exact page and take the
 * address out of the clipboard for them.
 */
const HOW = [
  {
    app: "iPhone / iCloud",
    open: "https://www.icloud.com/calendar",
    steps: "Apri Calendario, tocca l'icona ✓ accanto al nome del calendario, attiva «Calendario pubblico» e copia l'indirizzo.",
  },
  {
    app: "Google Calendar",
    open: "https://calendar.google.com/calendar/u/0/r/settings",
    steps: "Scegli il calendario nella colonna a sinistra → «Integra il calendario» → copia l'«Indirizzo segreto in formato iCal».",
  },
  {
    app: "Outlook / Microsoft 365",
    open: "https://outlook.office.com/calendar/options/calendar/SharedCalendars",
    steps: "Pubblica un calendario → scegli «Tutti i dettagli» → copia il link che finisce per .ics.",
  },
];

/**
 * The address out of whatever got pasted.
 *
 * People paste the whole line the calendar showed them — "Public Calendar
 * URL: webcal://…" — or an address with a stray space in it from the email
 * they sent themselves. Refusing that would be technically correct and
 * useless.
 */
export function extractUrl(text: string): string {
  const match = text.replace(/\s+/g, " ").match(/(webcal|https?):\/\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[.,;)]+$/, "") : text.trim();
}

export function CalendarLink({ connected, lastSync, lastError }: { connected: boolean; lastSync: string | null; lastError: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(lastError ?? "");
  const [done, setDone] = useState("");
  const [open, setOpen] = useState(false);

  /**
   * Takes the address straight out of the clipboard and connects with it.
   *
   * The browser asks the phone's own permission for this, and if it refuses —
   * or there is nothing there — it says so and leaves the field below, which
   * still works.
   */
  async function paste() {
    setBusy("paste"); setError(""); setDone("");
    try {
      const text = await navigator.clipboard.readText();
      const found = extractUrl(text || "");
      if (!/^(https?|webcal):\/\//i.test(found)) {
        setError("Negli appunti non c'è un indirizzo di calendario. Copialo dal tuo calendario e riprova, oppure incollalo nel campo qui sotto.");
        return;
      }
      setUrl(found);
      await call("connect", found);
    } catch {
      setError("Il telefono non mi ha lasciato leggere gli appunti. Incolla l'indirizzo nel campo qui sotto.");
    } finally { setBusy(""); }
  }

  async function call(action: "connect" | "sync" | "disconnect", pasted?: string) {
    setBusy(action); setError(""); setDone("");
    try {
      const response = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          url: action === "connect" ? (pasted ?? url).trim() : undefined,
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
      {/* Paste first, and connect in the same breath. Retyping a hundred
          random characters off another screen is not a thing anybody will do
          twice, and the address is unreadable by design. */}
      <button
        type="button"
        className="primary full"
        style={{ minHeight: 56, fontSize: 17 }}
        disabled={Boolean(busy)}
        onClick={paste}
      >
        {busy === "paste" ? <><span className="navSpin" aria-hidden /> Leggo…</> : "📋 Incolla l'indirizzo e collega"}
      </button>

      <p className="composerNote" style={{ margin: "12px 0 4px" }}>Oppure incollalo qui a mano:</p>
      <input
        className="linkInput"
        type="url"
        inputMode="url"
        placeholder="https://… .ics"
        value={url}
        onChange={(event) => setUrl(extractUrl(event.target.value))}
        aria-label="Indirizzo del calendario"
      />
      <button
        type="button"
        className="secondary full"
        style={{ marginTop: 8 }}
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
            <p key={how.app} className="composerNote" style={{ marginBottom: 10 }}>
              <strong>{how.app}</strong>{" "}
              <a href={how.open} target="_blank" rel="noreferrer" style={{ color: "var(--brandText)", fontWeight: 700 }}>apri →</a>
              <br />{how.steps}
              <br /><em>Poi torna qui e tocca «Incolla l&rsquo;indirizzo e collega».</em>
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

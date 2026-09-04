"use client";

import { useState } from "react";

/**
 * The personal forwarding address, and the two things people do with it.
 *
 * It is long and unguessable on purpose, which also makes it unrepeatable
 * from memory — so it is never something to type. Copy is the primary action,
 * and the second one is admitting it got out.
 */
export function AliasCard({ address }: { address: string }) {
  const [current, setCurrent] = useState(address);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(current);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (an old browser, or a page without focus): select
      // it instead so a long press can still copy by hand.
      const node = document.getElementById("aliasText");
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      const response = await fetch("/api/mail/alias", { method: "POST" });
      const data = await response.json();
      if (response.ok && data.address) { setCurrent(data.address); setConfirming(false); }
    } catch { /* the old address keeps working; nothing is lost */ }
    finally { setBusy(false); }
  }

  return (
    <section className="card">
      <div className="kicker">Il tuo indirizzo</div>
      <p id="aliasText" className="aliasText">{current}</p>
      <div className="aliasRow">
        <button type="button" className="primary" onClick={copy}>{copied ? "✓ Copiato" : "Copia"}</button>
        <button type="button" className="secondary" onClick={() => setConfirming(true)} disabled={busy}>
          Cambia indirizzo
        </button>
      </div>
      <p className="composerNote" style={{ marginTop: 10 }}>
        Salvalo nei contatti come <strong>Sam</strong>: inoltrare diventa un tocco. Funziona da qualunque tua casella —
        conta dove arriva, non da dove parte.
      </p>
      {confirming ? (
        <div className="notice" style={{ marginTop: 10 }}>
          <strong>Cambio l&rsquo;indirizzo?</strong> Quello vecchio smette di funzionare subito: le mail inoltrate lì
          non arriveranno più. Le mail già ricevute restano dove sono.
          <div className="aliasRow" style={{ marginTop: 10 }}>
            <button type="button" className="primary" onClick={regenerate} disabled={busy}>
              {busy ? "Un attimo…" : "Sì, cambialo"}
            </button>
            <button type="button" className="secondary" onClick={() => setConfirming(false)} disabled={busy}>Annulla</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

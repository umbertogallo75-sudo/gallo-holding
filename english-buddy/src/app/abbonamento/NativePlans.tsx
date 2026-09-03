"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Native Apple in-app purchases, shown only inside the iOS app build that
 * exposes the StoreKit bridge (webkit.messageHandlers.iap). Flow:
 *   1. tap → postMessage {action:"purchase", product} → native StoreKit sheet
 *   2. app calls window.__iapPurchased(jws) on success
 *   3. this page confirms server-side (cookies ride along) and reloads
 * Older app builds have no bridge → component renders nothing and the
 * reader-mode page stays as it is.
 */

type IapBridge = { postMessage: (message: { action: string; product?: string; products?: string[] }) => void };

function bridge(): IapBridge | null {
  const w = window as unknown as { webkit?: { messageHandlers?: { iap?: IapBridge } } };
  return w.webkit?.messageHandlers?.iap ?? null;
}

// Fallbacks are the exact Italian App Store price points configured for the
// products. New native builds replace them with StoreKit's localized prices.
const PLANS = [
  { product: "it.execlingo.app.program", title: "Programma 3 mesi", price: "99,99 €", note: "Una volta sola · il percorso completo", star: true },
  { product: "it.execlingo.app.annual", title: "Annuale", price: "199,00 €/anno", note: "12 mesi completi · circa 16,58 € al mese", star: true },
  { product: "it.execlingo.app.monthly", title: "Mensile", price: "39,99 €/mese", note: "Accesso completo, disdici quando vuoi", star: false },
  { product: "it.execlingo.app.maintenance", title: "Mantenimento", price: "29,99 €/mese", note: "Dopo il programma: non perdere quello che hai costruito", star: false },
];

export function NativePlans({ maintenance }: { maintenance: boolean }) {
  const available = useSyncExternalStore(() => () => {}, () => bridge() !== null, () => false);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "purchasing" | "confirming" | "done">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const w = window as unknown as {
      __iapPurchased?: (jws: string) => void;
      __iapFailed?: (reason?: string) => void;
      __iapProducts?: (json: string) => void;
    };
    w.__iapProducts = (json: string) => {
      try {
        const rows = JSON.parse(json) as Array<{ id?: string; price?: string }>;
        setPrices(Object.fromEntries(rows.filter((row) => row.id && row.price).map((row) => [row.id as string, row.price as string])));
      } catch {
        // Older shells simply keep the checked App Store fallback prices.
      }
    };
    w.__iapPurchased = async (jws: string) => {
      setState("confirming");
      try {
        const r = await fetch("/api/appstore/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jws }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "confirm");
        setState("done");
        window.location.reload();
      } catch (err) {
        setState("idle");
        setError(err instanceof Error && err.message !== "confirm" ? err.message : "Acquisto riuscito ma attivazione non riuscita: tocca “Ripristina acquisti”.");
      }
    };
    w.__iapFailed = (reason?: string) => {
      setState("idle");
      if (!reason || reason === "cancelled") return;
      // Reasons come from the Swift bridge — map them so a failed purchase
      // tells us (and support) which step broke.
      const messages: Record<string, string> = {
        "not-found": "I piani non risultano ancora disponibili su App Store (dopo l'attivazione del contratto può servire qualche ora). Riprova più tardi.",
        unverified: "Apple non ha potuto verificare l'acquisto: riprova.",
        pending: "Acquisto in attesa di approvazione (es. “Chiedi di acquistare”): verrà attivato appena confermato.",
        none: "Nessun acquisto precedente da ripristinare con questo account.",
      };
      setError(messages[reason] ?? "Acquisto non completato: riprova.");
    };
    bridge()?.postMessage({ action: "products", products: PLANS.map((plan) => plan.product) });
    return () => {
      delete w.__iapPurchased;
      delete w.__iapFailed;
      delete w.__iapProducts;
    };
  }, []);

  if (!available) return null;

  function buy(product: string) {
    setError("");
    setState("purchasing");
    bridge()?.postMessage({ action: "purchase", product });
  }

  return (
    <>
      {PLANS.map((p) => (
        <section key={p.product} className="card" style={p.star ? { borderColor: "color-mix(in srgb, var(--accent) 55%, var(--line))" } : undefined}>
          {p.star ? <div className="kicker">La promessa</div> : null}
          <h2 style={{ margin: "6px 0" }}>{p.title} — {prices[p.product] ?? p.price}</h2>
          <p className="muted" style={{ marginTop: 0 }}>{p.note}</p>
          {p.product.endsWith(".maintenance") && !maintenance ? (
            <p className="itHint" style={{ margin: 0 }}>
              🔒 Si attiva dopo il <strong>Programma 3 mesi</strong>: è il piano che lo prosegue. Se ti serve solo un mese, scegli il <strong>Mensile</strong>.
            </p>
          ) : (
            <button type="button" className="primary full" disabled={state !== "idle"} onClick={() => buy(p.product)}>
              {state === "purchasing" ? "Attendi…" : state === "confirming" ? "Attivo il piano…" : `Attiva — ${prices[p.product] ?? p.price}`}
            </button>
          )}
        </section>
      ))}
      {error ? <p className="warnText" style={{ margin: "0 4px 8px" }}>{error}</p> : null}
      <p className="itHint" style={{ margin: "0 4px 10px", textAlign: "center" }}>
        Pagamento gestito da Apple · prezzi IVA inclusa · si disdice da Impostazioni → Abbonamenti ·{" "}
        <button type="button" className="linklike" style={{ font: "inherit", color: "inherit", textDecoration: "underline", background: "none", border: 0, padding: 0 }} onClick={() => { setError(""); bridge()?.postMessage({ action: "restore" }); }}>
          Ripristina acquisti
        </button>
      </p>
    </>
  );
}

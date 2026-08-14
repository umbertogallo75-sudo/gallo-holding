"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Google Play in-app purchases inside the Android app. Two paths:
 *   • native app — window.ExecLingoNative.purchase() opens the Play sheet in
 *     Kotlin and calls back with the purchase token
 *   • legacy TWA — the Digital Goods API, which only works when Chrome backs
 *     the shell (Samsung Internet fails with clientAppUnavailable)
 * Either way the token goes to /api/playstore/confirm, where the server asks
 * Google for the authoritative state before activating anything. With no
 * bridge at all the component shows the check-your-email hint instead.
 */

/** Native bridge exposed by the Kotlin app (window.ExecLingoNative). */
type NativeBridge = { purchase: (productId: string) => void; restore: () => void };

function nativeBridge(): NativeBridge | null {
  const w = window as unknown as { ExecLingoNative?: NativeBridge };
  return typeof w.ExecLingoNative?.purchase === "function" ? w.ExecLingoNative : null;
}

type DigitalGoodsService = {
  getDetails: (ids: string[]) => Promise<{ itemId: string; title: string; price: { currency: string; value: string } }[]>;
  listPurchases: () => Promise<{ itemId: string; purchaseToken: string }[]>;
};

const PLAY_BILLING_METHOD = "https://play.google.com/billing";

function digitalGoods(): Promise<DigitalGoodsService> | null {
  const w = window as unknown as { getDigitalGoodsService?: (method: string) => Promise<DigitalGoodsService> };
  if (!w.getDigitalGoodsService) return null;
  return w.getDigitalGoodsService(PLAY_BILLING_METHOD);
}

const PLANS = [
  { product: "program", title: "Programma 3 mesi", fallbackPrice: "99,99 €", note: "Una volta sola · il percorso completo", star: true },
  { product: "monthly", title: "Mensile", fallbackPrice: "39,99 €/mese", note: "Accesso completo, disdici quando vuoi", star: false },
  { product: "maintenance", title: "Mantenimento", fallbackPrice: "29,99 €/mese", note: "Dopo il programma: non perdere quello che hai costruito", star: false },
];

function formatPrice(currency: string, value: string, perMonth: boolean): string {
  const amount = Number(value).toFixed(2).replace(".", ",");
  const symbol = currency === "EUR" ? "€" : currency;
  return `${amount} ${symbol}${perMonth ? "/mese" : ""}`;
}

export function AndroidPlans({ maintenance }: { maintenance: boolean }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "purchasing" | "confirming">("idle");
  const [error, setError] = useState("");
  // What Google actually answers — on screen only with ?diag=1, so a future
  // commissioning round can see the same evidence without shipping debug UI.
  const [diag, setDiag] = useState<string[]>([]);
  const log = (line: string) => setDiag((d) => [...d, line]);
  const showDiag = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).has("diag"),
    () => false
  );

  // Native app: the Kotlin bridge answers, and the page just relays tokens.
  useEffect(() => {
    const w = window as unknown as {
      __playPurchased?: (productId: string, token: string) => void;
      __playFailed?: (reason?: string) => void;
    };
    w.__playPurchased = async (productId: string, token: string) => {
      setState("confirming");
      const ok = await confirm(productId, token);
      if (ok) { window.location.reload(); return; }
      setState("idle");
      setError("Acquisto riuscito ma attivazione non riuscita: tocca “Ripristina acquisti”.");
    };
    w.__playFailed = (reason?: string) => {
      setState("idle");
      if (reason && reason !== "cancelled") setError(`Acquisto non completato (${reason}). Riprova.`);
    };
    return () => { delete w.__playPurchased; delete w.__playFailed; };
  }, []);

  useEffect(() => {
    (async () => {
      if (nativeBridge()) { setAvailable(true); log("ponte nativo Android: ok"); return; }
      // Legacy TWA path: Play Billing only works when Chrome backs the shell.
      // Samsung Internet exposes the same API and fails with clientAppUnavailable.
      const ua = navigator.userAgent;
      const engine = /SamsungBrowser\/([\d.]+)/.exec(ua)?.[0]
        ?? /Chrome\/([\d.]+)/.exec(ua)?.[0]
        ?? "browser sconosciuto";
      log(`motore: ${engine}`);

      const promise = digitalGoods();
      if (!promise) { setAvailable(false); log("bridge: assente"); return; }
      try {
        await promise;
        log("bridge: ok");
      } catch (err) {
        // Play Billing bridge unavailable on this install.
        setAvailable(false);
        log(`bridge: errore ${err instanceof Error ? err.name : "?"}`);
        return;
      }
      // The bridge exists: show the cards even if price lookup fails (the
      // fallback prices display and a purchase attempt surfaces the error).
      setAvailable(true);
      try {
        const service = await promise;
        const details = await service.getDetails(PLANS.map((p) => p.product));
        log(`prodotti visti da Google: ${details.length}${details.length ? " (" + details.map((d) => d.itemId).join(", ") + ")" : ""}`);
        const found: Record<string, string> = {};
        for (const item of details) {
          found[item.itemId] = formatPrice(item.price.currency, item.price.value, item.itemId !== "program");
        }
        setPrices(found);
      } catch (err) {
        log(`getDetails: errore ${err instanceof Error ? `${err.name} — ${err.message}` : "?"}`);
      }
    })();
  }, []);

  async function confirm(productId: string, purchaseToken: string): Promise<boolean> {
    const response = await fetch("/api/playstore/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, purchaseToken }),
    });
    return response.ok;
  }

  async function buy(productId: string) {
    setError("");
    setState("purchasing");
    const native = nativeBridge();
    if (native) { native.purchase(productId); return; }   // answer arrives via __playPurchased
    try {
      const request = new PaymentRequest(
        [{ supportedMethods: PLAY_BILLING_METHOD, data: { sku: productId } }],
        { total: { label: "Totale", amount: { currency: "EUR", value: "0" } } }
      );
      const canPay = await request.canMakePayment().catch((e) => {
        log(`canMakePayment: errore ${e instanceof Error ? e.name : "?"}`);
        return null;
      });
      log(`canMakePayment: ${String(canPay)}`);
      if (canPay === false) {
        setState("idle");
        setError("Google Play non è pronto a gestire il pagamento su questo dispositivo (canMakePayment=false). Verifica di aver installato l'app dal Play Store e riprova tra qualche ora.");
        return;
      }
      const response = await request.show();
      const { purchaseToken } = response.details as { purchaseToken: string };
      setState("confirming");
      const ok = await confirm(productId, purchaseToken);
      await response.complete(ok ? "success" : "fail");
      if (!ok) throw new Error("confirm");
      window.location.reload();
    } catch (err) {
      setState("idle");
      if (err instanceof Error && err.message === "confirm") {
        setError("Acquisto riuscito ma attivazione non riuscita: tocca “Ripristina acquisti”.");
      } else if (err instanceof DOMException && err.name === "NotSupportedError") {
        setError("Questo piano non è ancora disponibile su Google Play: riprova più tardi.");
      } else if (err instanceof DOMException && err.name === "AbortError") {
        // Also raised when the Play sheet fails to open — keep it visible.
        setError(`Acquisto annullato da Google Play (${err.message || "AbortError"}). Riprova.`);
      } else {
        const detail = err instanceof Error ? ` (${err.name}: ${err.message})` : "";
        setError(`Acquisto non completato${detail}: riprova.`);
      }
    }
  }

  async function restore() {
    setError("");
    const native = nativeBridge();
    if (native) { native.restore(); return; }
    try {
      const service = await digitalGoods();
      if (!service) return;
      const purchases = await service.listPurchases();
      for (const purchase of purchases) {
        if (await confirm(purchase.itemId, purchase.purchaseToken)) {
          window.location.reload();
          return;
        }
      }
      setError("Nessun acquisto da ripristinare con questo account Google.");
    } catch {
      setError("Ripristino non riuscito: riprova.");
    }
  }

  // Old app build without Play Billing: the welcome email carries the steps.
  if (available === false) {
    return <p className="itHint">📧 Ti abbiamo inviato una email all&rsquo;indirizzo del tuo account con i passaggi per attivare l&rsquo;accesso completo — controlla la posta (anche lo spam).</p>;
  }
  if (available === null) return null;

  return (
    <>
      {PLANS.map((p) => (
        <section key={p.product} className="card" style={p.star ? { borderColor: "color-mix(in srgb, var(--accent) 55%, var(--line))" } : undefined}>
          {p.star ? <div className="kicker">La promessa</div> : null}
          <h2 style={{ margin: "6px 0" }}>{p.title} — {prices[p.product] ?? p.fallbackPrice}</h2>
          <p className="muted" style={{ marginTop: 0 }}>{p.note}</p>
          {p.product === "maintenance" && !maintenance ? (
            <p className="itHint" style={{ margin: 0 }}>
              🔒 Si attiva dopo il <strong>Programma 3 mesi</strong>: è il piano che lo prosegue. Se ti serve solo un mese, scegli il <strong>Mensile</strong>.
            </p>
          ) : (
            <button type="button" className="primary full" disabled={state !== "idle"} onClick={() => buy(p.product)}>
              {state === "purchasing" ? "Attendi…" : state === "confirming" ? "Attivo il piano…" : `Attiva — ${prices[p.product] ?? p.fallbackPrice}`}
            </button>
          )}
        </section>
      ))}
      {error ? <p className="warnText" style={{ margin: "0 4px 8px" }}>{error}</p> : null}
      {showDiag && diag.length ? (
        <p className="itHint" style={{ margin: "0 4px 10px", opacity: 0.75, lineHeight: 1.5 }}>
          🔎 Diagnostica Play: {diag.join(" · ")}
        </p>
      ) : null}
      <p className="itHint" style={{ margin: "0 4px 10px", textAlign: "center" }}>
        Pagamento gestito da Google Play · prezzi IVA inclusa · si disdice da Play Store → Abbonamenti ·{" "}
        <button type="button" className="linklike" style={{ font: "inherit", color: "inherit", textDecoration: "underline", background: "none", border: 0, padding: 0 }} onClick={restore}>
          Ripristina acquisti
        </button>
      </p>
    </>
  );
}

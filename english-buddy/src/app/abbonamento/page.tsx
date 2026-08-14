import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isEmbeddedApp } from "@/lib/appclient";
import { getUserId, OWNER_ID } from "@/lib/auth";
import { getBilling, getEntitlement, stripeConfigured, stripeTestMode } from "@/lib/stripe";
import { AndroidPlans } from "./AndroidPlans";
import { NativePlans } from "./NativePlans";
import { PlanButton } from "./PlanButton";
import { RedeemBox } from "./RedeemBox";

export const dynamic = "force-dynamic";
export const metadata = { title: "Abbonamento · ExecLingo" };

// No prices here: the same plan costs Stripe prices on the web and App Store
// tier prices in the app, so the active-plan label stays price-free.
const PLAN_LABELS: Record<string, string> = {
  monthly: "Mensile",
  program: "Programma 3 mesi",
  maintenance: "Mantenimento",
};

export default async function AbbonamentoPage({ searchParams }: { searchParams: Promise<{ esito?: string }> }) {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  const { esito } = await searchParams;

  const [billing, entitlement, embedded] = await Promise.all([getBilling(userId), getEntitlement(userId), isEmbeddedApp()]);
  const hasPlan = entitlement.reason === "plan";

  // Store-app wrappers: native IAP when enabled, otherwise reader-app mode —
  // plan status and corporate-code redemption only (Apple guideline 3.1.1).
  // Only the iOS shell (UA marker) carries the StoreKit bridge: the Android
  // TWA is embedded via cookie and never shows purchase UI (Play policy).
  const requestHeaders = await headers();
  const iosShell = (requestHeaders.get("user-agent") ?? "").includes("ExecLingoApp/");
  const iapOn = process.env.APPSTORE_IAP_UI === "on" && iosShell;
  if (embedded) {
    return (
      <main className="shell">
        <div className="topbar"><div className="brand">ExecLingo</div><Link className="chip" href="/home">← Home</Link></div>
        <section className="hero">
          <div className="kicker">Il tuo piano</div>
          <h1>{hasPlan || entitlement.access ? "Sei operativo." : "Il tuo accesso."}</h1>
          {userId === OWNER_ID ? (
            <p className="muted">Account fondatore: accesso completo, per sempre.</p>
          ) : entitlement.reason === "free" ? (
            <p className="muted">Il tuo account ha l&rsquo;accesso completo gratuito. Buon allenamento con Sam!</p>
          ) : hasPlan ? (
            <p className="muted">
              Piano attivo: <strong>{PLAN_LABELS[billing?.plan ?? ""] ?? billing?.plan}</strong>
              {billing?.currentPeriodEnd ? ` · rinnovo/scadenza ${billing.currentPeriodEnd.slice(0, 10)}` : ""}
            </p>
          ) : iapOn ? (
            <p className="muted">Il test del livello con Sam è gratuito. Per allenarti ogni giorno — chat, voce, missioni, notifiche — attiva un piano qui sotto.</p>
          ) : (
            <p className="muted">Il test del livello con Sam è gratuito. L&rsquo;accesso completo si attiva con un piano sul tuo account ExecLingo o con un codice aziendale.</p>
          )}
        </section>
        {/* Native IAP UI stays dark until the products are approved with a
            release (flip APPSTORE_IAP_UI=on in Vercel — no app update needed). */}
        {!hasPlan && userId !== OWNER_ID && iapOn ? <NativePlans /> : null}
        {/* Android: Play Billing is off by default. The TWA only reaches Play
            Billing through Chrome — on Samsung Internet it fails outright
            (clientAppUnavailable) — so locked users get the email route, which
            works on every device. Flip PLAY_IAP_UI=on to re-enable the plans
            (e.g. once a native Android app replaces the wrapper). */}
        {!hasPlan && !entitlement.access && userId !== OWNER_ID && !iosShell ? (
          process.env.PLAY_IAP_UI === "on" ? (
            <AndroidPlans />
          ) : (
            <p className="itHint" style={{ margin: "0 4px 10px" }}>
              📧 Ti abbiamo inviato una email all&rsquo;indirizzo del tuo account con i passaggi per attivare l&rsquo;accesso completo — controlla la posta (anche lo spam).
            </p>
          )
        ) : null}
        {!hasPlan && userId !== OWNER_ID ? <RedeemBox /> : null}
        <p className="itHint" style={{ margin: "14px 4px 24px" }}><Link href="/termini">Termini</Link> · <Link href="/privacy">Privacy</Link></p>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">ExecLingo</div><Link className="chip" href="/home">← Home</Link></div>

      {esito === "ok" ? (
        <section className="card" style={{ borderColor: "color-mix(in srgb, var(--accent) 55%, var(--line))" }}>
          <h2 style={{ marginTop: 0 }}>🎉 Pagamento ricevuto!</h2>
          <p className="muted">Il tuo piano è attivo (può servire qualche secondo perché compaia qui sotto). Sam ti aspetta.</p>
          <Link className="pill" href="/home" style={{ textDecoration: "none" }}>Torna ad allenarti →</Link>
        </section>
      ) : null}
      {esito === "annullato" ? (
        <section className="card">
          <p className="muted" style={{ margin: 0 }}>Pagamento annullato — nessun addebito. Quando vuoi, i piani sono qui sotto.</p>
        </section>
      ) : null}

      <section className="hero">
        <div className="kicker">Il tuo piano</div>
        <h1>{hasPlan ? "Sei operativo." : "Scegli il tuo percorso."}</h1>
        {userId === OWNER_ID ? (
          <p className="muted">Account fondatore: accesso completo, per sempre.</p>
        ) : entitlement.reason === "free" ? (
          <p className="muted">Il tuo account ha l&rsquo;accesso completo gratuito. Buon allenamento con Sam!</p>
        ) : hasPlan ? (
          <p className="muted">
            Piano attivo: <strong>{PLAN_LABELS[billing?.plan ?? ""] ?? billing?.plan}</strong>
            {billing?.currentPeriodEnd ? ` · rinnovo/scadenza ${billing.currentPeriodEnd.slice(0, 10)}` : ""}
          </p>
        ) : (
          <p className="muted">Il test del livello con Sam è gratuito. Per allenarti ogni giorno — chat, voce, missioni, notifiche — scegli il piano che fa per te.</p>
        )}
        <p className="itHint">Pagamento sicuro con Stripe: carta, Apple Pay o Google Pay. Prezzi IVA inclusa. Disdici quando vuoi i piani mensili.</p>
      </section>

      {stripeConfigured() && stripeTestMode() ? (
        <p className="itHint" style={{ margin: "0 4px 10px" }}>🧪 Modalità di prova attiva: nessun addebito reale (carta di test: 4242 4242 4242 4242).</p>
      ) : null}

      <section className="card">
        <div className="kicker">La promessa</div>
        <h2 style={{ margin: "6px 0" }}>Programma 3 mesi — 99,90 €</h2>
        <p className="muted" style={{ marginTop: 0 }}>Una volta sola, ≈ 33 €/mese. Il percorso completo: da dove sei a operativo in inglese — riunioni, call, trasferte. Il 3-Month Executive Path con Sam, tutte le modalità incluse.</p>
        <PlanButtonWrap plan="program" label="Inizia il programma — 99,90 €" />
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Mensile — 39,90 €/mese</h2>
        <p className="muted" style={{ marginTop: 0 }}>Accesso completo, senza vincoli: disdici quando vuoi.</p>
        <PlanButtonWrap plan="monthly" label="Attiva il mensile — 39,90 €/mese" />
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Mantenimento — 29,90 €/mese</h2>
        <p className="muted" style={{ marginTop: 0 }}>Per chi ha completato il programma: non perdere quello che hai costruito — ripasso, notifiche e Sam sempre con te.</p>
        <PlanButtonWrap plan="maintenance" label="Attiva il mantenimento — 29,90 €/mese" />
      </section>

      {!hasPlan && userId !== OWNER_ID ? <RedeemBox /> : null}

      <p className="itHint" style={{ margin: "14px 4px 24px" }}>
        Aziende: licenze team con sconti volume su <Link href="/aziende">execlingo.it/aziende</Link> · <Link href="/termini">Termini</Link> · <Link href="/privacy">Privacy</Link>
      </p>
    </main>
  );
}

function PlanButtonWrap({ plan, label }: { plan: string; label: string }) {
  return <PlanButton plan={plan} label={label} />;
}

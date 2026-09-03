import Link from "next/link";
import { LandingTracker } from "@/app/LandingTracker";
import { SitePage } from "@/components/SitePage";
import { StoreBadges } from "@/components/StoreBadges";
import { isEmbeddedApp } from "@/lib/appclient";
import { getUserId } from "@/lib/auth";

export const metadata = {
  title: "Piani e offerte ExecLingo",
  description: "Confronta i piani ExecLingo per professionisti e aziende: mensile, annuale, programma 3 mesi, mantenimento e licenze team.",
  alternates: { canonical: "/offerte" },
};

const plans: ReadonlyArray<{ name: string; price: string; detail: string; badge?: string }> = [
  { name: "Annuale", price: "199,00 €/anno", detail: "12 mesi completi · circa 16,58 € al mese", badge: "Più conveniente" },
  { name: "Programma 3 mesi", price: "99,90 € una volta", detail: "Il percorso guidato per diventare operativo in riunioni, call e trasferte", badge: "Percorso completo" },
  { name: "Mensile", price: "39,90 €/mese", detail: "Accesso completo e rinnovo mensile, disdici quando vuoi" },
  { name: "Mantenimento", price: "29,90 €/mese", detail: "Riservato a chi ha già completato il Programma 3 mesi" },
];

export default async function OffertePage() {
  const [embedded, userId] = await Promise.all([isEmbeddedApp(), getUserId()]);
  const signedIn = Boolean(userId);
  if (embedded) {
    return (
      <SitePage showPricing={false}>
        <section className="hero">
          <div className="kicker">Piani ExecLingo</div>
          <h1>Scegli il piano direttamente nell&rsquo;app.</h1>
          <p className="muted">Apri la pagina Abbonamento dal tuo profilo: Apple o Google ti mostreranno le opzioni disponibili e il prezzo ufficiale prima della conferma.</p>
          <p style={{ marginBottom: 0 }}><Link href="/abbonamento" className="landCta">Vai ai piani nell&rsquo;app</Link></p>
        </section>
      </SitePage>
    );
  }

  return (
    <SitePage>
      <LandingTracker page="offerte" />
      <section className="hero">
        <div className="kicker">Piani e offerte</div>
        <h1>Un piano chiaro per ogni obiettivo.</h1>
        <p className="muted">Il test iniziale con Sam dura circa 3 minuti ed è gratuito. Scegli il piano solo dopo aver visto da dove parti.</p>
        <p style={{ marginBottom: 0 }}>
          <Link
            href={signedIn ? "/home" : "/register"}
            className="landCta"
            data-track={signedIn ? undefined : "landing_cta_register"}
            data-where={signedIn ? undefined : "offerte"}
          >{signedIn ? "Apri ExecLingo" : "Prova Sam gratis"}</Link>
        </p>
      </section>

      <section className="landPrices" aria-label="Piani individuali ExecLingo">
        {plans.map((plan) => (
          <article key={plan.name} className={`landPrice${plan.badge ? " landStar" : ""}`}>
            {plan.badge ? <div className="landFlag">{plan.badge}</div> : null}
            <div className="landPlanName">{plan.name}</div>
            <div className="landAmount" style={{ fontSize: 28 }}>{plan.price}</div>
            <p>{plan.detail}</p>
          </article>
        ))}
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <div className="kicker">Aziende, HR e L&amp;D</div>
        <h2 style={{ margin: "6px 0" }}>Licenze team con fattura unica</h2>
        <p className="muted">Il Programma 3 mesi è disponibile con sconti automatici a volume: 5% da 10 licenze, 10% da 50 e 15% da 150. I codici di attivazione arrivano subito via email.</p>
        <Link href="/aziende" className="landCta2" style={{ borderColor: "var(--accent)", color: "var(--brandText)" }}>Scopri le licenze aziendali →</Link>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Prezzi sul sito e negli store</h2>
        <p className="muted">Sul sito il pagamento è gestito da Stripe. Su iPhone e Android il pagamento in-app è gestito dallo store, che mostra sempre il prezzo ufficiale e localizzato prima della conferma. Il piano Annuale è impostato a 199,00 € anche per l&rsquo;Italia negli store.</p>
        <StoreBadges where="offerte" compact />
      </section>

      <p className="itHint" style={{ margin: "14px 4px 24px", textAlign: "center" }}>Tutti i prezzi indicati sono IVA inclusa. Per i piani ricorrenti puoi interrompere il rinnovo in qualsiasi momento.</p>
    </SitePage>
  );
}

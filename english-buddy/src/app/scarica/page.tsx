import Link from "next/link";
import { SitePage } from "@/components/SitePage";
import { StoreBadges } from "@/components/StoreBadges";
import { LandingTracker } from "@/app/LandingTracker";
import { getUserId } from "@/lib/auth";
import { configuredAppStoreUrl, playStoreCampaignUrl } from "@/lib/store-links";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Scarica ExecLingo — iPhone, Android e computer",
  description: "Installa ExecLingo sul tuo telefono: App Store, Google Play o direttamente dal browser in 10 secondi.",
  alternates: { canonical: "/scarica" },
};

type ScaricaPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Public download page. The store badges appear automatically as soon as
 * APP_STORE_URL / PLAY_STORE_URL are set in the environment; until then the
 * page teaches the 10-second browser install, which works today.
 */
export default async function ScaricaPage({ searchParams }: ScaricaPageProps) {
  const appStore = configuredAppStoreUrl();
  const [params, userId] = await Promise.all([searchParams, getUserId()]);
  const signedIn = Boolean(userId);
  const playStore = playStoreCampaignUrl(process.env.PLAY_STORE_URL, params);
  const hasStores = Boolean(appStore || playStore);

  return (
    <SitePage>
      <LandingTracker page="scarica" />

      <section className="hero">
        <div className="kicker">Scarica l&rsquo;app</div>
        <h1>ExecLingo sul tuo telefono.</h1>
        <p className="muted">Il tuo coach d&rsquo;inglese sempre in tasca: notifiche intelligenti, sessioni da 2 minuti, tutto sincronizzato.</p>
      </section>

      {hasStores ? (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Scarica dagli store</h2>
          <p className="muted">Tocca il badge del tuo telefono: si apre direttamente la pagina ufficiale di ExecLingo.</p>
          <StoreBadges
            where="scarica"
            appStoreUrl={appStore}
            playStoreUrl={playStore}
          />
          {!appStore || !playStore ? (
            <p className="itHint" style={{ marginBottom: 0 }}>{!appStore ? "Il collegamento all’App Store non è momentaneamente disponibile." : "Il collegamento a Google Play non è momentaneamente disponibile."}</p>
          ) : null}
        </section>
      ) : (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>App Store e Google Play</h2>
          <p className="muted" style={{ marginBottom: 0 }}>I collegamenti agli store non sono momentaneamente disponibili. Puoi comunque installare ExecLingo <strong>adesso, in 10 secondi</strong>, direttamente dal browser: è la stessa app, con icona e notifiche.</p>
        </section>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>📱 In alternativa, su iPhone e iPad</h2>
        <ol className="muted" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Apri <strong>www.execlingo.it</strong> in <strong>Safari</strong> e accedi</li>
          <li>Tocca il tasto <strong>Condividi</strong> (il quadrato con la freccia in su)</li>
          <li>Scegli <strong>&ldquo;Aggiungi alla schermata Home&rdquo;</strong> → <strong>Aggiungi</strong></li>
        </ol>
        <p className="itHint" style={{ marginBottom: 0 }}>L&rsquo;icona di ExecLingo compare tra le tue app, a schermo intero e con le notifiche.</p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>🤖 In alternativa, su Android</h2>
        <ol className="muted" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Apri <strong>www.execlingo.it</strong> in <strong>Chrome</strong> e accedi</li>
          <li>Tocca i <strong>tre puntini</strong> in alto a destra</li>
          <li>Scegli <strong>&ldquo;Installa app&rdquo;</strong> (o &ldquo;Aggiungi a schermata Home&rdquo;)</li>
        </ol>
        <p className="itHint" style={{ marginBottom: 0 }}>Su molti telefoni Chrome propone l&rsquo;installazione da solo con un banner.</p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>💻 Computer</h2>
        <p className="muted" style={{ marginBottom: 0 }}>Nessuna installazione: vai su <strong>www.execlingo.it</strong> da Chrome, Edge o Safari. Su Chrome ed Edge puoi installare ExecLingo come app dal simbolo <strong>⊕</strong> nella barra dell&rsquo;indirizzo.</p>
      </section>

      <div style={{ margin: "8px 0 24px" }}>
        <Link
          href={signedIn ? "/home" : "/register"}
          className="landCta"
          data-track={signedIn ? undefined : "landing_cta_register"}
          data-where={signedIn ? undefined : "scarica"}
          style={{ textDecoration: "none" }}
        >{signedIn ? "Apri ExecLingo" : "Prova Sam gratis — test di 3 minuti"}</Link>
      </div>
    </SitePage>
  );
}

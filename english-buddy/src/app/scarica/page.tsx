import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Scarica ExecLingo — iPhone, Android e computer",
  description: "Installa ExecLingo sul tuo telefono: App Store, Google Play o direttamente dal browser in 10 secondi.",
};

/**
 * Public download page. The store badges appear automatically as soon as
 * APP_STORE_URL / PLAY_STORE_URL are set in the environment; until then the
 * page teaches the 10-second browser install, which works today.
 */
export default function ScaricaPage() {
  const appStore = process.env.APP_STORE_URL;
  const playStore = process.env.PLAY_STORE_URL;
  const hasStores = Boolean(appStore || playStore);

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">ExecLingo</div><Link className="chip" href="/">← Home</Link></div>

      <section className="hero">
        <div className="kicker">Scarica l&rsquo;app</div>
        <h1>ExecLingo sul tuo telefono.</h1>
        <p className="muted">Il tuo coach d&rsquo;inglese sempre in tasca: notifiche intelligenti, sessioni da 2 minuti, tutto sincronizzato.</p>
      </section>

      {hasStores ? (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Scarica dagli store</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {appStore ? (
              <a href={appStore} className="landCta" data-track="download_appstore" style={{ textDecoration: "none" }}> App Store — iPhone e iPad</a>
            ) : null}
            {playStore ? (
              <a href={playStore} className="landCta" data-track="download_playstore" style={{ textDecoration: "none" }}>▶ Google Play — Android</a>
            ) : null}
          </div>
          {!appStore || !playStore ? (
            <p className="itHint" style={{ marginBottom: 0 }}>{!appStore ? "La versione iPhone arriva a breve sull'App Store." : "La versione Android arriva a breve su Google Play."}</p>
          ) : null}
        </section>
      ) : (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>App Store e Google Play</h2>
          <p className="muted" style={{ marginBottom: 0 }}>Le app per iPhone e Android sono in arrivo negli store. Nel frattempo puoi installare ExecLingo <strong>adesso, in 10 secondi</strong>, direttamente dal browser: è la stessa app, con icona e notifiche.</p>
        </section>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>📱 iPhone e iPad</h2>
        <ol className="muted" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Apri <strong>www.execlingo.it</strong> in <strong>Safari</strong> e accedi</li>
          <li>Tocca il tasto <strong>Condividi</strong> (il quadrato con la freccia in su)</li>
          <li>Scegli <strong>&ldquo;Aggiungi alla schermata Home&rdquo;</strong> → <strong>Aggiungi</strong></li>
        </ol>
        <p className="itHint" style={{ marginBottom: 0 }}>L&rsquo;icona di ExecLingo compare tra le tue app, a schermo intero e con le notifiche.</p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>🤖 Android</h2>
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
        <Link href="/register" className="landCta" data-track="download_cta_register" style={{ textDecoration: "none" }}>Prova Sam gratis — test di 3 minuti</Link>
      </div>
    </main>
  );
}

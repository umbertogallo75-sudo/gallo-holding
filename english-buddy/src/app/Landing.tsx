import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { StoreBadges } from "@/components/StoreBadges";
import { LandingTracker } from "./LandingTracker";

/**
 * Public marketing landing shown at "/" in a normal browser — the destination
 * for every ad click and the institutional home even for signed-in users.
 */
export function Landing({ hidePricing = false, signedIn = false }: { hidePricing?: boolean; signedIn?: boolean }) {
  const productHref = signedIn ? "/home" : "/register";
  const productLabel = signedIn ? "Apri ExecLingo" : "Prova Sam gratis — test di 3 minuti";
  return (
    <div className="landing">
      <SiteHeader showPricing={!hidePricing} signedIn={signedIn} />
      <main id="contenuto">
        <LandingTracker />
        <section className="landHero">
          <div className="landShell">
            <div className="landEyebrow">Business English con intelligenza artificiale</div>
            <h1 className="landH1">In 3 mesi sei <span className="landGrad">operativo in inglese</span>.</h1>
            <p className="landLead">Riunioni, call, negoziazioni, trasferte. <strong>Sam</strong>, il tuo coach personale con intelligenza artificiale, ti allena pochi minuti al giorno — nei ritagli veri della tua giornata, anche partendo da zero.</p>
            <div className="landCtas">
              <Link
                href={productHref}
                className="landCta"
                data-track={signedIn ? undefined : "landing_cta_register"}
              >{productLabel}</Link>
              {signedIn ? null : <Link href="/login" className="landCta2" data-track="landing_cta_login">Ho già un account</Link>}
            </div>
            {hidePricing ? null : <StoreBadges where="home_hero" centered className="storeBadgesHero" />}
            <p className="landHint">Niente lezioni fisse. Niente esercizi da scuola. Nessuna carta di credito per iniziare. <Link href="/scarica" data-track="landing_download" style={{ color: "inherit" }}>📲 Installa l&rsquo;app sul telefono</Link></p>
          </div>
        </section>

        <section className="landShell landSection" aria-labelledby="pubblico-title">
          <div className="kicker">Per te e per il tuo team</div>
          <h2 className="landH2" id="pubblico-title">Un obiettivo concreto, due percorsi.</h2>
          <div className="landAudienceGrid">
            <article className="landAudienceCard">
              <div className="landIco" aria-hidden="true">💼</div>
              <h3>Professionisti</h3>
              <p>Per chi deve parlare inglese in riunione, con clienti o in trasferta e vuole allenarsi senza tornare sui banchi di scuola.</p>
              <Link href="/inglese-lavoro" data-track="landing_cta_professionisti">Scopri il percorso individuale <span aria-hidden="true">→</span></Link>
            </article>
            <article className="landAudienceCard">
              <div className="landIco" aria-hidden="true">🏢</div>
              <h3>Aziende, HR e L&amp;D</h3>
              <p>Licenze a volume per team, codici di attivazione immediati, fattura unica e un percorso orientato al lavoro reale.</p>
              <Link href="/aziende" data-track="landing_cta_aziende">Scopri ExecLingo per aziende <span aria-hidden="true">→</span></Link>
            </article>
          </div>
        </section>

      <section className="landShell landSection" id="come-funziona">
        <div className="kicker">Perché funziona</div>
        <h2 className="landH2">Un coach, non un corso.</h2>
        <div className="landGrid">
          <div className="landCard"><div className="landIco" aria-hidden="true">⏱</div><h3>Pochi minuti, quando puoi</h3><p>Micro-sessioni da 2 a 20 minuti. In taxi, tra due riunioni, la sera. Anche 2 minuti contano — e Sam lo sa.</p></div>
          <div className="landCard"><div className="landIco" aria-hidden="true">📲</div><h3>È Sam a cercarti</h3><p>Ti scrive lui durante il giorno, come un amico inglese: una domanda breve, rispondi quando vuoi. L&rsquo;inglese entra nella giornata da solo.</p></div>
          <div className="landCard"><div className="landIco" aria-hidden="true">💼</div><h3>Business e viaggi, subito</h3><p>Riunioni, trattative, finanza, aeroporti, ristoranti. L&rsquo;inglese che ti serve davvero, insegnato nelle situazioni in cui lo userai.</p></div>
          <div className="landCard"><div className="landIco" aria-hidden="true">🎙️</div><h3>Parla davvero, a voce</h3><p>Conversazioni vocali in tempo reale con Sam: ti ascolta, risponde e ti corregge con gentilezza. La strada più veloce alla sicurezza.</p></div>
          <div className="landCard"><div className="landIco" aria-hidden="true">🧠</div><h3>Una memoria che ti conosce</h3><p>Sam ricorda i tuoi errori e le espressioni imparate, e le ripropone al momento giusto finché non sono tue. Per sempre.</p></div>
          <div className="landCard"><div className="landIco" aria-hidden="true">🆘</div><h3>English Rescue</h3><p>Ti serve una frase <em>adesso</em>? Scrivila in italiano: te la restituisce in inglese in tre registri, con l&rsquo;audio. In riunione, in hotel, ovunque.</p></div>
        </div>
      </section>

      <section className="landShell landSection" id="percorso">
        <div className="kicker">3-Month Executive Path</div>
        <h2 className="landH2">Tre mesi, un piano, capacità reali.</h2>
        <div className="landPhases">
          <div className="landPhase"><div className="landNum">1</div><div><h3>Mese 1 — Fondamenta</h3><p>Presentarti, i numeri, il viaggio, sopravvivere in riunione. Con l&rsquo;italiano di supporto se parti da zero.</p></div></div>
          <div className="landPhase"><div className="landNum">2</div><div><h3>Mese 2 — Lavoro</h3><p>Opinioni, problemi, call, progetti, trattative semplici. L&rsquo;italiano si ritira man mano che cresci.</p></div></div>
          <div className="landPhase"><div className="landNum">3</div><div><h3>Mese 3 — Manageriale</h3><p>Negoziazioni, finanza, investitori, presentazioni. Operativo, davvero.</p></div></div>
        </div>
        <p className="landHint" style={{ textAlign: "center" }}>I progressi non sono voti: sono capacità reali che Sam spunta quando le dimostri — «sai presentarti», «sai trattare un prezzo», «sai gestire una call».</p>
      </section>

      {hidePricing ? null : <section className="landShell landSection" id="abbonamenti">
        <div className="kicker">Prezzi semplici</div>
        <h2 className="landH2">Meno di un&rsquo;ora di un coach umano. Al mese.</h2>
        <p className="landHint" style={{ margin: "0 0 14px" }}>Tutti i prezzi sono IVA inclusa: quello che vedi è quello che paghi.</p>
        <div className="landPrices">
          <div className="landPrice landStar"><div className="landFlag">Più conveniente</div><div className="landPlanName">Annuale</div><div className="landAmount">199,00 €<span>/anno</span></div><p>Dodici mesi completi con Sam. Circa 16,58 €/mese.</p></div>
          <div className="landPrice"><div className="landPlanName">Mensile</div><div className="landAmount">39,90 €<span>/mese</span></div><p>Accesso completo a Sam, senza vincoli.</p></div>
          <div className="landPrice landStar"><div className="landFlag">La promessa</div><div className="landPlanName">Programma 3 mesi</div><div className="landAmount">99,90 €<span> una volta</span></div><p>Il percorso completo: da dove sei a operativo. ≈ 33 €/mese.</p></div>
          <div className="landPrice"><div className="landPlanName">Mantenimento</div><div className="landAmount">29,90 €<span>/mese</span></div><p>Dopo il programma: non perdere quello che hai costruito.</p></div>
        </div>
        <p className="landHint" style={{ textAlign: "center" }}><Link href="/offerte">Confronta tutti i piani e le offerte disponibili</Link></p>
        <div className="landCard" style={{ marginTop: 14, textAlign: "center" }}>
          <div className="landIco">🏢</div>
          <h3>ExecLingo per aziende</h3>
          <p>Licenze team con sconti volume: <strong>10+ −5%</strong> · <strong>50+ −10%</strong> · <strong>150+ −15%</strong>. Codici subito via email, ogni collega attiva il suo percorso in un minuto.</p>
          <p style={{ marginTop: 12 }}><Link href="/aziende" className="landCta2" style={{ borderColor: "var(--accent)", color: "var(--brandText)" }} data-track="landing_cta_aziende">Attiva il tuo team →</Link></p>
        </div>
      </section>}

      <section className="landShell landSection landAppSection" id="app" aria-labelledby="app-title">
        <div>
          <div className="kicker">Ovunque lavori</div>
          <h2 className="landH2" id="app-title">Il tuo coach su iPhone, Android e computer.</h2>
          <p>Inizia una sessione sul telefono e continua dal browser: il tuo account, i progressi e ciò che Sam ricorda restano sincronizzati.</p>
          <div className="landPlatformList" aria-label="Piattaforme disponibili">
            <span>iPhone e iPad</span><span>Android</span><span>Web</span>
          </div>
        </div>
        <div className="landAppAction">
          {hidePricing ? null : <StoreBadges where="home_app_section" compact centered />}
          <Link href="/scarica" data-track="landing_download" data-where="home_app_section" style={{ color: "var(--brandText)", fontSize: 13, fontWeight: 750, textUnderlineOffset: 3 }}>Vedi anche le istruzioni di installazione</Link>
        </div>
      </section>

      <section className="landShell landSection landFinal">
        <h2 className="landH2" style={{ textAlign: "center" }}>Il tuo tempo è prezioso.<br />Anche il tuo inglese dovrebbe esserlo.</h2>
        <div className="landCtas" style={{ justifyContent: "center" }}>
          <Link
            href={productHref}
            className="landCta"
            data-track={signedIn ? undefined : "landing_cta_register"}
          >{signedIn ? "Apri ExecLingo" : "Inizia ora — il test è gratis"}</Link>
        </div>
      </section>
      </main>
      <SiteFooter showPricing={!hidePricing} signedIn={signedIn} showStoreBadges={!hidePricing} />
    </div>
  );
}

import Link from "next/link";
import { StoreBadges } from "./StoreBadges";

type SiteFooterProps = {
  showPricing?: boolean;
  signedIn?: boolean;
  showStoreBadges?: boolean;
};

/** Full sitemap for the public, institutional part of ExecLingo. */
export function SiteFooter({ showPricing = true, signedIn = false, showStoreBadges = true }: SiteFooterProps) {
  return (
    <footer className="siteFooter">
      <div className="siteFooterInner">
        <div className="siteFooterIntro">
          <Link href="/" className="siteLogo" aria-label="ExecLingo — home">
            <span className="siteLogoDot" aria-hidden="true" />
            <span>ExecLingo</span>
          </Link>
          <p>Business English con Sam, il coach AI che si adatta al tuo lavoro e al tempo che hai davvero.</p>
          <p className="siteFooterCompany">Un servizio VASP ITALIA SRL</p>
          {showStoreBadges ? (
            <StoreBadges where="footer" compact className="storeBadgesFooter" />
          ) : null}
        </div>

        <nav className="siteFooterNav" aria-label="Mappa del sito">
          <div>
            <h2>ExecLingo</h2>
            <Link href="/#come-funziona">Come funziona</Link>
            <Link href="/#percorso">Il percorso</Link>
            {showPricing ? <Link href="/#abbonamenti">Abbonamenti</Link> : null}
            {showPricing ? <Link href="/offerte">Piani e offerte</Link> : null}
            <Link href="/guida">Guida video</Link>
            <Link href="/scarica">App iOS e Android</Link>
          </div>
          <div>
            <h2>Soluzioni</h2>
            <Link href="/inglese-lavoro">Per professionisti</Link>
            <Link href="/aziende">Per aziende</Link>
            <Link href="/partner">Programma Partner</Link>
            <Link href={signedIn ? "/home" : "/register"}>{signedIn ? "Apri ExecLingo" : "Prova gratuita"}</Link>
          </div>
          <div>
            <h2>Informazioni</h2>
            <Link href="/privacy">Privacy</Link>
            <Link href="/cookie">Cookie</Link>
            <Link href="/termini">Termini di servizio</Link>
            <Link href="/elimina-account">Elimina account</Link>
          </div>
        </nav>
      </div>
      <div className="siteFooterBottom">
        <span>VASP ITALIA SRL · P. IVA 03463400634 · Napoli</span>
        <a href="mailto:ug@vaspitalia.com">ug@vaspitalia.com</a>
      </div>
      {showStoreBadges ? (
        <p className="siteFooterStoreLegal">
          Apple e il logo Apple sono marchi di Apple Inc., registrati negli Stati Uniti e in altri Paesi e regioni. App Store è un marchio di servizio di Apple Inc. Google Play e il logo Google Play sono marchi di Google LLC.
        </p>
      ) : null}
    </footer>
  );
}

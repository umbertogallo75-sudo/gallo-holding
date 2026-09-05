import Link from "next/link";

type SiteHeaderProps = {
  showPricing?: boolean;
  signedIn?: boolean;
};

const coreLinks = [
  { href: "/#come-funziona", label: "Come funziona" },
  { href: "/#percorso", label: "Il percorso" },
  { href: "/guida", label: "Guida video" },
  { href: "/aziende", label: "Per aziende" },
  { href: "/scarica", label: "Scarica l’app" },
] as const;

/**
 * Navigation shared by the public, institutional part of ExecLingo.
 * The mobile menu deliberately uses native details/summary: it works without
 * JavaScript, keeps keyboard semantics, and cannot get stuck after a failed
 * hydration.
 */
export function SiteHeader({ showPricing = true, signedIn = false }: SiteHeaderProps) {
  const links = showPricing
    ? [...coreLinks.slice(0, 2), { href: "/#abbonamenti", label: "Abbonamenti" }, { href: "/offerte", label: "Piani e offerte" }, ...coreLinks.slice(2)]
    : coreLinks;

  return (
    <>
      <a className="siteSkipLink" href="#contenuto">Vai al contenuto</a>
      <header className="siteHeader">
        <div className="siteHeaderInner">
          <Link href="/" className="siteLogo" aria-label="ExecLingo — home">
            <span className="siteLogoDot" aria-hidden="true" />
            <span>ExecLingo</span>
          </Link>

          <nav className="siteNavDesktop" aria-label="Navigazione principale">
            {links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
          </nav>

          <div className="siteHeaderActions">
            {signedIn ? (
              <Link href="/home" className="siteStart">Apri ExecLingo</Link>
            ) : (
              <>
                <Link href="/login" className="siteLogin">Accedi</Link>
                <Link href="/register" className="siteStart" data-track="landing_cta_register" data-where="header">
                  Prova gratis
                </Link>
              </>
            )}
          </div>

          <details className="siteNavMobile">
            <summary aria-label="Apri il menu di navigazione">
              <span aria-hidden="true" className="siteMenuIcon" />
              <span>Menu</span>
            </summary>
            <nav aria-label="Navigazione mobile">
              {links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
              <Link href="/inglese-lavoro">Per professionisti</Link>
              <Link href="/partner">Programma Partner</Link>
              {signedIn ? (
                <Link href="/home" className="siteMobileStart">Apri ExecLingo</Link>
              ) : (
                <>
                  <Link href="/login">Accedi</Link>
                  <Link href="/register" className="siteMobileStart" data-track="landing_cta_register" data-where="mobile_menu">
                    Prova Sam gratis
                  </Link>
                </>
              )}
            </nav>
          </details>
        </div>
      </header>
    </>
  );
}

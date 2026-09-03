import type { ReactNode } from "react";
import { isEmbeddedApp } from "@/lib/appclient";
import { getUserId } from "@/lib/auth";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

type SitePageProps = {
  children: ReactNode;
  /** Explicit pages can hide commercial navigation too; embedded store shells
   * always win and never expose the website pricing routes. */
  showPricing?: boolean;
};

/** Consistent frame for public institutional pages (not campaign landings). */
export async function SitePage({ children, showPricing = true }: SitePageProps) {
  const [embedded, userId] = await Promise.all([isEmbeddedApp(), getUserId()]);
  const pricingVisible = showPricing && !embedded;
  const signedIn = Boolean(userId);
  return (
    <div className="sitePage">
      <SiteHeader showPricing={pricingVisible} signedIn={signedIn} />
      <main id="contenuto" className="shell sitePageMain">{children}</main>
      <SiteFooter showPricing={pricingVisible} signedIn={signedIn} showStoreBadges={!embedded} />
    </div>
  );
}

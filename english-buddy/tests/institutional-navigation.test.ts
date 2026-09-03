import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactNode } from "react";

const { getUserIdMock, isEmbeddedAppMock } = vi.hoisted(() => ({
  getUserIdMock: vi.fn(),
  isEmbeddedAppMock: vi.fn(),
}));

vi.mock("@/lib/appclient", () => ({
  isEmbeddedApp: isEmbeddedAppMock,
}));
vi.mock("@/lib/auth", () => ({
  getUserId: getUserIdMock,
}));

import { Landing } from "@/app/Landing";
import InglesePerLavoroPage from "@/app/inglese-lavoro/page";
import OffertePage from "@/app/offerte/page";
import PartnerLandingPage from "@/app/partner/page";
import ScaricaPage from "@/app/scarica/page";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SitePage } from "@/components/SitePage";
import { isPublicPage } from "@/lib/public-pages";

type ElementProps = Record<string, unknown> & { children?: ReactNode };

function allElementProps(node: ReactNode): ElementProps[] {
  if (Array.isArray(node)) return node.flatMap(allElementProps);
  if (!isValidElement(node)) return [];
  const props = node.props as ElementProps;
  return [props, ...allElementProps(props.children)];
}

function hrefs(node: ReactNode): string[] {
  return allElementProps(node)
    .map((props) => props.href)
    .filter((href): href is string => typeof href === "string");
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(" ");
  if (!isValidElement(node)) return "";
  return textContent((node.props as ElementProps).children);
}

describe("institutional navigation", () => {
  beforeEach(() => {
    isEmbeddedAppMock.mockResolvedValue(false);
    getUserIdMock.mockResolvedValue(null);
  });

  it("makes every main public destination available from the desktop and mobile header", () => {
    const links = hrefs(SiteHeader({ showPricing: true }));

    for (const destination of [
      "/#come-funziona",
      "/#percorso",
      "/#abbonamenti",
      "/offerte",
      "/aziende",
      "/scarica",
      "/inglese-lavoro",
      "/partner",
      "/login",
      "/register",
    ]) {
      expect(links, destination).toContain(destination);
    }
  });

  it("links only to known public routes", () => {
    const links = [
      ...hrefs(SiteHeader({ showPricing: true })),
      ...hrefs(SiteFooter({ showPricing: true })),
    ];

    for (const href of links) {
      if (href.startsWith("mailto:")) continue;
      const pathname = new URL(href, "https://www.execlingo.it").pathname;
      expect(isPublicPage(pathname), href).toBe(true);
    }
  });

  it("keeps the reader-app variant free of a link to the hidden pricing section", () => {
    expect(hrefs(SiteHeader({ showPricing: false }))).not.toContain("/#abbonamenti");
    expect(hrefs(SiteFooter({ showPricing: false }))).not.toContain("/#abbonamenti");
    expect(hrefs(SiteHeader({ showPricing: false }))).not.toContain("/offerte");
    expect(hrefs(SiteFooter({ showPricing: false }))).not.toContain("/offerte");
  });

  it("replaces registration actions with one product action for a signed-in visitor", () => {
    const header = SiteHeader({ showPricing: true, signedIn: true });
    const footer = SiteFooter({ showPricing: true, signedIn: true });
    const landing = Landing({ hidePricing: false, signedIn: true });

    for (const rendered of [header, footer, landing]) {
      expect(hrefs(rendered)).toContain("/home");
      expect(hrefs(rendered)).not.toContain("/login");
      expect(hrefs(rendered)).not.toContain("/register");
      expect(textContent(rendered)).toContain("Apri ExecLingo");
    }
  });

  it("propagates reader-app pricing visibility through the shared institutional frame", async () => {
    isEmbeddedAppMock.mockResolvedValue(true);
    const page = await SitePage({ children: "Contenuto" });
    const pricingFlags = allElementProps(page)
      .map((props) => props.showPricing)
      .filter((value): value is boolean => typeof value === "boolean");

    expect(pricingFlags).toEqual([false, false]);
  });

  it("preserves pricing navigation in the shared frame on the public website", async () => {
    const page = await SitePage({ children: "Contenuto" });
    const pricingFlags = allElementProps(page)
      .map((props) => props.showPricing)
      .filter((value): value is boolean => typeof value === "boolean");

    expect(pricingFlags).toEqual([true, true]);
  });

  it("propagates the authenticated state through every institutional page frame", async () => {
    getUserIdMock.mockResolvedValue("signed-in-user");
    const page = await SitePage({ children: "Contenuto" });
    const authFlags = allElementProps(page)
      .map((props) => props.signedIn)
      .filter((value): value is boolean => typeof value === "boolean");

    expect(authFlags).toEqual([true, true]);
  });

  it("does not expose website prices from direct public routes inside a store app", async () => {
    isEmbeddedAppMock.mockResolvedValue(true);
    const [offers, campaign, partner] = await Promise.all([
      OffertePage(),
      InglesePerLavoroPage({ searchParams: Promise.resolve({}) }),
      PartnerLandingPage(),
    ]);
    const rendered = [offers, campaign, partner].map(textContent).join(" ");

    for (const webPrice of ["199,00", "99,90", "39,90", "29,90", "16,58", "4,09"]) {
      expect(rendered).not.toContain(webPrice);
    }
    expect(textContent(offers)).toContain("Apple o Google");
  });

  it("keeps the published website prices visible in a normal browser", async () => {
    const [offers, campaign, partner] = await Promise.all([
      OffertePage(),
      InglesePerLavoroPage({ searchParams: Promise.resolve({}) }),
      PartnerLandingPage(),
    ]);

    expect(textContent(offers)).toContain("199,00 €/anno");
    expect(textContent(campaign)).toContain("€39,90");
    expect(textContent(partner)).toContain("4,09 €");
  });

  it("keeps institutional and campaign CTAs coherent for a signed-in visitor", async () => {
    getUserIdMock.mockResolvedValue("signed-in-user");
    const [offers, campaign, download] = await Promise.all([
      OffertePage(),
      InglesePerLavoroPage({ searchParams: Promise.resolve({}) }),
      ScaricaPage({ searchParams: Promise.resolve({}) }),
    ]);

    for (const rendered of [offers, campaign, download]) {
      expect(hrefs(rendered)).toContain("/home");
      expect(hrefs(rendered)).not.toContain("/register");
      expect(textContent(rendered)).toContain("Apri ExecLingo");
    }
  });

  it("gives the homepage stable destinations for product, path, prices and app", () => {
    const page = Landing({ hidePricing: false });
    const ids = allElementProps(page)
      .map((props) => props.id)
      .filter((id): id is string => typeof id === "string");

    expect(ids).toEqual(expect.arrayContaining([
      "contenuto",
      "come-funziona",
      "percorso",
      "abbonamenti",
      "app",
    ]));
    expect(hrefs(page)).toEqual(expect.arrayContaining(["/aziende", "/inglese-lavoro", "/scarica", "/offerte", "/register"]));
  });
});

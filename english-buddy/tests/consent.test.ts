import { afterEach, describe, expect, it, vi } from "vitest";
import { CONSENT_COOKIE, CONSENT_VERSION, consentCookieValue, readConsent, readConsentReceipt } from "@/lib/consent";

const RECEIPT = "3f8a1c22-9d44-4b71-9a55-0e2c7b6d1a90";
const cookie = (value: string) => `${CONSENT_COOKIE}=${encodeURIComponent(value)}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readConsent", () => {
  it("reads both answers", () => {
    expect(readConsent(cookie(consentCookieValue("granted", RECEIPT)))).toBe("granted");
    expect(readConsent(cookie(consentCookieValue("denied", RECEIPT)))).toBe("denied");
  });

  it("treats no cookie as no answer, so the banner asks", () => {
    expect(readConsent(null)).toBeNull();
    expect(readConsent("")).toBeNull();
    expect(readConsent("session=abc; eb_src=%7B%7D")).toBeNull();
  });

  it("finds the cookie among others", () => {
    expect(readConsent(`eb_ref=x; ${cookie(consentCookieValue("denied", RECEIPT))}; session=y`)).toBe("denied");
  });

  it("asks again when the policy version has moved on", () => {
    expect(readConsent(cookie(`0:granted:${RECEIPT}`))).toBeNull();
    expect(readConsent(cookie(`${CONSENT_VERSION}:granted:${RECEIPT}`))).toBe("granted");
  });

  it("never reads a hand-edited value as consent", () => {
    expect(readConsent(cookie(`${CONSENT_VERSION}:yes`))).toBeNull();
    expect(readConsent(cookie("granted"))).toBeNull();
    expect(readConsent(`${CONSENT_COOKIE}=%E0%A4%A`)).toBeNull();
  });
});

describe("readConsentReceipt", () => {
  it("hands back the id of the log row this choice was written to", () => {
    expect(readConsentReceipt(cookie(consentCookieValue("granted", RECEIPT)))).toBe(RECEIPT);
  });

  it("is null for a cookie from before receipts existed", () => {
    expect(readConsentReceipt(cookie(`${CONSENT_VERSION}:granted`))).toBeNull();
    expect(readConsentReceipt(null)).toBeNull();
  });

  it("ignores a receipt from a superseded policy version", () => {
    expect(readConsentReceipt(cookie(`0:granted:${RECEIPT}`))).toBeNull();
  });

  it("refuses an oversized receipt rather than passing it on", () => {
    expect(readConsentReceipt(cookie(`${CONSENT_VERSION}:granted:${"x".repeat(200)}`))).toBeNull();
  });
});

describe("privacy nelle app degli store", () => {
  it("riconosce le shell iOS, Android e la vecchia TWA", async () => {
    const { isStoreShellContext } = await import("@/components/ConsentBanner");
    expect(isStoreShellContext("Mobile ExecLingoApp/1.3", "")).toBe(true);
    expect(isStoreShellContext("Mobile ExecLingoAndroid/1.1.0", "")).toBe(true);
    expect(isStoreShellContext("Chrome", "session=x; eb_app=twa")).toBe(true);
  });

  it("lascia disponibili i tag sul sito pubblico", async () => {
    const { isStoreShellContext } = await import("@/components/ConsentBanner");
    expect(isStoreShellContext("Safari", "eb_consent=2%3Agranted%3Areceipt")).toBe(false);
    expect(isStoreShellContext("Safari", "eb_app=qualcosa")).toBe(false);
  });

  it("non carica mai tag di terze parti dentro una shell anche con consenso preesistente", async () => {
    const { shouldLoadMarketingTags } = await import("@/components/ConsentBanner");
    expect(shouldLoadMarketingTags("granted", true, true)).toBe(false);
    expect(shouldLoadMarketingTags("granted", true, false)).toBe(true);
    expect(shouldLoadMarketingTags("denied", true, false)).toBe(false);
  });
});

describe("hasMarketingTags con la sola analitica", () => {
  it("mostra il banner anche se è configurato solo Google Analytics", async () => {
    const before = { ...process.env };
    process.env.NEXT_PUBLIC_META_PIXEL_ID = "";
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = "";
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-TEST12345";
    process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID = "";
    vi.resetModules();
    const { hasMarketingTags, activeTagNames } = await import("@/lib/consent");
    // Senza questo il banner non comparirebbe, quindi nessun consenso e
    // quindi nessuna analitica: un guasto che non lascerebbe traccia.
    expect(hasMarketingTags()).toBe(true);
    expect(activeTagNames()).toContain("ga4");
    process.env = before;
  });
});


describe("Google Analytics 4 di ExecLingo", () => {
  it("usa lo stream Web assegnato sul dominio di produzione quando non c'è un override", async () => {
    const before = { ...process.env };
    try {
      delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
      vi.stubGlobal("window", { location: { hostname: "www.execlingo.it" } });
      vi.resetModules();
      const { GA4_MEASUREMENT_ID, marketingTags } = await import("@/lib/consent");
      expect(GA4_MEASUREMENT_ID).toBe("G-Y5BX21MQYQ");
      expect(marketingTags().analyticsId).toBe("G-Y5BX21MQYQ");
    } finally {
      process.env = before;
    }
  });

  it.each(["localhost", "english-buddy-git-feature.vercel.app"])(
    "non usa il Measurement ID di produzione per fallback su %s",
    async (hostname) => {
      const before = { ...process.env };
      try {
        delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
        vi.stubGlobal("window", { location: { hostname } });
        vi.resetModules();
        const { marketingTags } = await import("@/lib/consent");
        expect(marketingTags().analyticsId).toBe("");
      } finally {
        process.env = before;
      }
    },
  );

  it("rispetta un override esplicito anche fuori produzione", async () => {
    const before = { ...process.env };
    try {
      process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-PREVIEWTEST";
      vi.stubGlobal("window", { location: { hostname: "localhost" } });
      vi.resetModules();
      const { marketingTags } = await import("@/lib/consent");
      expect(marketingTags().analyticsId).toBe("G-PREVIEWTEST");
    } finally {
      process.env = before;
    }
  });
});


describe("LinkedIn Insight Tag", () => {
  it("espone il Partner ID assegnato a ExecLingo e rende il tag soggetto a consenso", async () => {
    const before = { ...process.env };
    process.env.NEXT_PUBLIC_META_PIXEL_ID = "";
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = "";
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "";
    delete process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID;
    vi.resetModules();
    const { activeTagNames, hasMarketingTags, marketingTags } = await import("@/lib/consent");
    expect(marketingTags().linkedinPartnerId).toBe("9624362");
    expect(hasMarketingTags()).toBe(true);
    expect(activeTagNames().split(",")).toContain("linkedin");
    process.env = before;
  });
});

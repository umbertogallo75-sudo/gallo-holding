import { describe, expect, it } from "vitest";
import {
  CANONICAL_APP_STORE_URL,
  CANONICAL_PLAY_STORE_URL,
  configuredAppStoreUrl,
  configuredPlayStoreUrl,
  playStoreCampaignUrl,
  redirectAttributionRecord,
  safeMarketingSearch,
} from "@/lib/store-links";

describe("Google Play cutover links", () => {
  it("normalizes the approved listing and rejects unsafe destinations", () => {
    expect(configuredPlayStoreUrl(
      "https://play.google.com/store/apps/details?id=it.execlingo.app&hl=it&gl=IT",
    )).toBe(CANONICAL_PLAY_STORE_URL);
    expect(configuredPlayStoreUrl("http://play.google.com/store/apps/details?id=it.execlingo.app")).toBeNull();
    expect(configuredPlayStoreUrl("https://example.com/store/apps/details?id=it.execlingo.app")).toBeNull();
    expect(configuredPlayStoreUrl("https://play.google.com/store/apps/details?id=other.app")).toBeNull();
    expect(configuredPlayStoreUrl(undefined)).toBeNull();
  });

  it("keeps only campaign parameters and never leaks arbitrary values", () => {
    const safe = safeMarketingSearch(new URLSearchParams(
      "utm_source=google&utm_medium=cpc&utm_campaign=riunioni&gclid=abc&token=secret&email=u%40example.com",
    ));
    expect(safe.toString()).toBe("utm_source=google&utm_medium=cpc&utm_campaign=riunioni&gclid=abc");
  });

  it("encodes campaign data inside the Google Play Install Referrer", () => {
    const destination = playStoreCampaignUrl(
      CANONICAL_PLAY_STORE_URL,
      { utm_source: "meta", utm_campaign: "android", token: "secret" },
    );
    const url = new URL(destination ?? "");
    expect(url.origin + url.pathname).toBe("https://play.google.com/store/apps/details");
    expect(url.searchParams.get("id")).toBe("it.execlingo.app");
    expect(url.searchParams.get("referrer")).toBe("utm_source=meta&utm_campaign=android");
  });

  it("infers a source from click IDs when a UTM source is absent", () => {
    expect(redirectAttributionRecord(
      { gclid: "click", utm_campaign: "search" },
      null,
      new Date("2026-08-31T10:00:00.000Z"),
    )).toEqual({ s: "google", c: "search", t: "2026-08-31T10:00:00.000Z" });

    // TikTok is web-only until the native apps have an SDK/MMP and consent:
    // its raw click id must not enter Google Play's Install Referrer.
    expect(safeMarketingSearch(new URLSearchParams("ttclid=tiktok-click")).toString()).toBe("");
  });
});

describe("App Store cutover links", () => {
  it("normalizes the verified ExecLingo listing and rejects unsafe destinations", () => {
    expect(configuredAppStoreUrl(
      "https://apps.apple.com/app/execlingo/id6800138841?l=it",
    )).toBe(CANONICAL_APP_STORE_URL);
    expect(configuredAppStoreUrl(CANONICAL_APP_STORE_URL)).toBe(CANONICAL_APP_STORE_URL);
    expect(configuredAppStoreUrl("http://apps.apple.com/it/app/execlingo/id6800138841")).toBeNull();
    expect(configuredAppStoreUrl("https://example.com/it/app/execlingo/id6800138841")).toBeNull();
    expect(configuredAppStoreUrl("https://apps.apple.com/it/app/execlingo/id0000000000")).toBeNull();
    expect(configuredAppStoreUrl(undefined)).toBeNull();
  });
});

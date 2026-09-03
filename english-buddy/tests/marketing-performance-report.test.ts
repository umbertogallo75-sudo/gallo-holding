import { describe, expect, it } from "vitest";
import type { MarketingKpi, MarketingSnapshot, MarketingTrackingHealth } from "@/lib/marketing/collector-store";
import {
  MARKETING_BUDGET_PLAN,
  MARKETING_BUDGET_TOTAL_EUR,
  MONTHLY_BUDGET_CAP_EUR,
  buildMarketingReport,
  googleAdsTrackingHealth,
  manualMarketingSlot,
  providerTrackingHealth,
  renderMarketingReportHtml,
  renderMarketingReportText,
  scheduledMarketingSlot,
  sumPaidChannelSpend,
  youtubeOrganicTrackingHealth,
} from "@/lib/marketing/performance-report";
import type { GoogleAdsReportingRow } from "@/lib/marketing/google-ads-reporting";
import type { ReportingMetric } from "@/lib/marketing/reporting-sources";
import type { YouTubeReportingMetric } from "@/lib/marketing/youtube-reporting";

const REPORT_NOW = new Date("2026-08-28T06:02:00.000Z");

function kpi(overrides: Partial<MarketingKpi> & Pick<MarketingKpi, "source" | "window">): MarketingKpi {
  return {
    runKey: "marketing-sync:2026-08-28:08",
    day: "2026-08-28",
    accountId: null,
    campaignId: null,
    campaignName: null,
    campaignStatus: null,
    currency: "EUR",
    spendMicros: null,
    impressions: null,
    clicks: null,
    downloads: null,
    registrations: null,
    leads: null,
    costPerRegistrationMicros: null,
    costPerLeadMicros: null,
    configuredMonthlyBudgetMicros: null,
    activeMonthlyBudgetMicros: null,
    budgetStatus: null,
    budgetDetail: null,
    campaignBudgets: [],
    dataStatus: "unavailable",
    sourceUpdatedAt: null,
    collectedAt: "2026-08-28T06:00:00.000Z",
    ...overrides,
  };
}

function tracking(overrides: Partial<MarketingTrackingHealth> & Pick<MarketingTrackingHealth, "source" | "event">): MarketingTrackingHealth {
  return {
    runKey: "marketing-sync:2026-08-28:08",
    status: "unavailable",
    lastConversionAt: null,
    detail: null,
    checkedAt: "2026-08-28T06:00:00.000Z",
    ...overrides,
  };
}

function googleAdsRow(
  overrides: Partial<GoogleAdsReportingRow> & Pick<GoogleAdsReportingRow, "channel" | "period">,
): GoogleAdsReportingRow {
  return {
    source: "google_ads",
    currencyCode: "EUR",
    spendEur: 0,
    registrations: null,
    costPerRegistration: null,
    campaignStatus: "enabled",
    campaignBudgets: [],
    configuredMonthlyBudgetEur: 0,
    activeMonthlyBudgetEur: 0,
    budgetStatus: "ok",
    budgetDetail: "Budget letto.",
    status: "ok",
    detail: "Dati letti dalla Google Ads API.",
    ...overrides,
  };
}

function providerRow(
  overrides: Partial<ReportingMetric> & Pick<ReportingMetric, "source" | "channel" | "period">,
): ReportingMetric {
  return {
    spendEur: null,
    resultCount: null,
    resultLabel: "registrazioni",
    costPerResult: null,
    currencyCode: null,
    campaignBudgets: [],
    configuredMonthlyBudgetEur: null,
    activeMonthlyBudgetEur: null,
    budgetStatus: "not_configured",
    budgetDetail: "Non applicabile.",
    status: "ok",
    detail: "API leggibile.",
    ...overrides,
  };
}

function youtubeRow(
  overrides: Partial<YouTubeReportingMetric> & Pick<YouTubeReportingMetric, "period">,
): YouTubeReportingMetric {
  return {
    source: "youtube_organic",
    channel: "youtube",
    views: null,
    annotationClicks: null,
    cardClicks: null,
    status: "ok",
    detail: "YouTube Analytics API leggibile.",
    ...overrides,
  };
}

function snapshot(): MarketingSnapshot {
  return {
    run: {
      runKey: "marketing-sync:2026-08-28:08",
      scheduledFor: "2026-08-28T06:00:00.000Z",
      status: "partial",
      startedAt: "2026-08-28T06:00:00.000Z",
      completedAt: "2026-08-28T06:01:00.000Z",
      failureCode: null,
      emailStatus: "sent",
      emailAttemptedAt: "2026-08-28T06:01:00.000Z",
      emailSentAt: "2026-08-28T06:01:00.000Z",
      updatedAt: "2026-08-28T06:01:00.000Z",
    },
    kpis: [
      kpi({ source: "meta", window: "today", spendMicros: 0, registrations: 0, dataStatus: "available" }),
      kpi({ source: "meta", window: "last7", spendMicros: 12_500_000, registrations: 0, dataStatus: "available" }),
      kpi({ source: "backend", window: "today", registrations: 0, dataStatus: "available" }),
      kpi({ source: "backend", window: "last7", registrations: 3, dataStatus: "available" }),
    ],
    tracking: [
      tracking({ source: "backend", event: "register_done", status: "verified" }),
      tracking({ source: "meta", event: "CompleteRegistration", status: "verified" }),
      tracking({ source: "google_ads", event: "registration", status: "unavailable" }),
    ],
  };
}

describe("marketing performance report", () => {
  it("uses the two Europe/Rome slots in winter and summer", () => {
    expect(scheduledMarketingSlot(new Date("2026-01-15T07:17:00.000Z"))).toMatchObject({
      runKey: "marketing-sync:2026-01-15:08",
      localHour: 8,
    });
    expect(scheduledMarketingSlot(new Date("2026-07-15T06:17:00.000Z"))).toMatchObject({
      runKey: "marketing-sync:2026-07-15:08",
      localHour: 8,
    });
    expect(scheduledMarketingSlot(new Date("2026-07-15T15:17:00.000Z"))).toMatchObject({
      runKey: "marketing-sync:2026-07-15:17",
      localHour: 17,
    });
    expect(scheduledMarketingSlot(new Date("2026-07-15T14:17:00.000Z"))).toBeNull();
  });

  it("deduplicates manual clicks inside the same five-minute bucket", () => {
    const first = manualMarketingSlot(new Date("2026-08-30T10:34:01.000Z"));
    const duplicate = manualMarketingSlot(new Date("2026-08-30T10:34:59.000Z"));
    const next = manualMarketingSlot(new Date("2026-08-30T10:35:00.000Z"));

    expect(first.runKey).toBe("marketing-sync:manual:2026-08-30-10-30");
    expect(duplicate.runKey).toBe(first.runKey);
    expect(next.runKey).toBe("marketing-sync:manual:2026-08-30-10-35");
  });

  it("keeps the authorised plan strictly below the monthly cap", () => {
    expect(MARKETING_BUDGET_TOTAL_EUR).toBe(1499.97);
    expect(MARKETING_BUDGET_TOTAL_EUR).toBeLessThanOrEqual(MONTHLY_BUDGET_CAP_EUR);
    expect(MARKETING_BUDGET_PLAN.find((item) => item.source === "google_ads_app")?.monthlyEur).toBe(0);
  });

  it("keeps an explicit zero distinct from unavailable data", () => {
    const report = buildMarketingReport(snapshot(), REPORT_NOW);
    const meta = report.channels.find((item) => item.source === "meta");
    const google = report.channels.find((item) => item.source === "google_ads_search");
    const googleApp = report.channels.find((item) => item.source === "google_ads_app");

    expect(meta).toMatchObject({ spendTodayEur: 0, resultsToday: 0, costPerResult7dEur: null, status: "available" });
    expect(google).toMatchObject({ spendTodayEur: null, resultsToday: null, status: "unavailable" });
    expect(googleApp).toMatchObject({ spendTodayEur: null, resultsToday: null, status: "unavailable" });
    const text = renderMarketingReportText(report);
    expect(text).toContain("Facebook + Instagram | 0,00 € | 12,50 € | 0 registrazioni | N/D | available");
    expect(text).toContain("Google Ads Search | N/D | N/D | N/D registrazioni | N/D | unavailable");
    expect(text).toContain("aprire ADMIN e selezionare «Aggiorna dati»");
    expect(text).not.toContain("08:00 o 17:00");
  });

  it("verifies Google web tracking from parsed allowlisted conversions", () => {
    const rows = [
      googleAdsRow({ channel: "search", period: "today" }),
      googleAdsRow({ channel: "search", period: "last7", registrations: 6 }),
      googleAdsRow({ channel: "youtube", period: "today" }),
      googleAdsRow({ channel: "youtube", period: "last7" }),
      googleAdsRow({ channel: "app", period: "today" }),
      googleAdsRow({ channel: "app", period: "last7" }),
    ];

    expect(googleAdsTrackingHealth(rows, "search", "google_ads")).toMatchObject({
      status: "verified",
      detail: expect.stringContaining("6 conversioni negli ultimi 7 giorni"),
    });
    expect(googleAdsTrackingHealth(rows, "youtube", "youtube")).toMatchObject({
      status: "verified",
      detail: expect.stringContaining("Azione sito web condivisa verificata da 6 conversioni"),
    });
    expect(googleAdsTrackingHealth(rows, "app", "google_ads_app")).toMatchObject({
      status: "unverified",
    });
  });

  it("treats a provider-returned zero as verified without inventing an absent row", () => {
    const explicitZero = [
      googleAdsRow({ channel: "youtube", period: "today" }),
      googleAdsRow({ channel: "youtube", period: "last7", registrations: 0 }),
    ];
    const absent = [
      googleAdsRow({ channel: "youtube", period: "today" }),
      googleAdsRow({ channel: "youtube", period: "last7" }),
    ];

    expect(googleAdsTrackingHealth(explicitZero, "youtube", "youtube")).toMatchObject({
      status: "verified",
      detail: expect.stringContaining("0 conversioni"),
    });
    expect(googleAdsTrackingHealth(absent, "youtube", "youtube")).toMatchObject({
      status: "unverified",
    });
  });

  it("uses last7 GA4 and Meta rows as tracking-health evidence without converting N/D to zero", () => {
    const metrics = [
      providerRow({ source: "ga4", channel: "web", period: "today" }),
      providerRow({ source: "ga4", channel: "web", period: "last7", resultCount: 1 }),
      providerRow({ source: "meta", channel: "facebook_instagram", period: "today" }),
      providerRow({ source: "meta", channel: "facebook_instagram", period: "last7", resultCount: 0 }),
    ];

    expect(providerTrackingHealth(metrics, "ga4", "sign_up")).toMatchObject({
      status: "verified",
      detail: expect.stringContaining("1 conversioni negli ultimi 7 giorni"),
    });
    expect(providerTrackingHealth(metrics, "meta", "CompleteRegistration")).toMatchObject({
      status: "verified",
      detail: expect.stringContaining("0 conversioni negli ultimi 7 giorni"),
    });

    const absent = [
      providerRow({ source: "ga4", channel: "web", period: "today" }),
      providerRow({ source: "ga4", channel: "web", period: "last7" }),
    ];
    const health = providerTrackingHealth(absent, "ga4", "sign_up");
    expect(health).toMatchObject({ status: "unverified" });
    expect(health.detail).toContain("valore resta N/D");
  });

  it("uses delayed last7 YouTube views without converting an absent today row to zero", () => {
    const rows = [
      youtubeRow({ period: "today" }),
      youtubeRow({ period: "last7", views: 2_100 }),
    ];

    expect(youtubeOrganicTrackingHealth(rows)).toMatchObject({
      source: "youtube_organic",
      status: "verified",
      detail: expect.stringContaining("2100 visualizzazioni negli ultimi 7 giorni"),
    });

    const explicitZero = [
      youtubeRow({ period: "today" }),
      youtubeRow({ period: "last7", views: 0 }),
    ];
    expect(youtubeOrganicTrackingHealth(explicitZero)).toMatchObject({
      status: "verified",
      detail: expect.stringContaining("0 visualizzazioni"),
    });

    const absent = [youtubeRow({ period: "today" }), youtubeRow({ period: "last7" })];
    expect(youtubeOrganicTrackingHealth(absent)).toMatchObject({ status: "unverified" });
  });

  it("renders a clean HTML report without exposing credentials", () => {
    const html = renderMarketingReportHtml(buildMarketingReport(snapshot(), REPORT_NOW));
    expect(html).toContain("ExecLingo — Report performance");
    expect(html).toContain("Semaforo: Rosso");
    expect(html).toContain("<table");
    expect(html).not.toContain("access_token");
    expect(html).not.toContain("refresh_token");
  });

  it("includes an active App campaign in the real-budget cap guardrail", () => {
    const value = snapshot();
    const metaToday = value.kpis.find((item) => item.source === "meta" && item.window === "today")!;
    Object.assign(metaToday, {
      activeMonthlyBudgetMicros: 450_000_000,
      configuredMonthlyBudgetMicros: 450_000_000,
      budgetStatus: "available",
    });
    value.kpis.push(
      kpi({ source: "google_ads_search", window: "today", activeMonthlyBudgetMicros: 590_000_000, configuredMonthlyBudgetMicros: 590_000_000, budgetStatus: "available" }),
      kpi({ source: "linkedin", window: "today", activeMonthlyBudgetMicros: 300_000_000, configuredMonthlyBudgetMicros: 300_000_000, budgetStatus: "available" }),
      kpi({ source: "google_ads_youtube", window: "today", activeMonthlyBudgetMicros: 150_000_000, configuredMonthlyBudgetMicros: 150_000_000, budgetStatus: "available" }),
      kpi({ source: "google_ads_app", window: "today", activeMonthlyBudgetMicros: 20_000_000, configuredMonthlyBudgetMicros: 20_000_000, budgetStatus: "available" }),
    );

    const report = buildMarketingReport(value, REPORT_NOW);
    expect(report.actualActiveBudgetEur).toBe(1510);
    expect(report.budgetVerification).toBe("over_cap");
    expect(report.semaphore).toBe("Rosso");
    expect(report.priorities[0]).toContain("superano il tetto");
  });

  it("verifies the real budget when an unfunded App source has no data", () => {
    const value = snapshot();
    const metaToday = value.kpis.find((item) => item.source === "meta" && item.window === "today")!;
    Object.assign(metaToday, {
      activeMonthlyBudgetMicros: 450_000_000,
      configuredMonthlyBudgetMicros: 450_000_000,
      budgetStatus: "available",
    });
    value.kpis.push(
      kpi({ source: "google_ads_search", window: "today", activeMonthlyBudgetMicros: 597_970_000, configuredMonthlyBudgetMicros: 597_970_000, budgetStatus: "available" }),
      kpi({ source: "linkedin", window: "today", activeMonthlyBudgetMicros: 300_000_000, configuredMonthlyBudgetMicros: 300_000_000, budgetStatus: "available" }),
      kpi({ source: "google_ads_youtube", window: "today", activeMonthlyBudgetMicros: 152_000_000, configuredMonthlyBudgetMicros: 152_000_000, budgetStatus: "available" }),
    );

    const report = buildMarketingReport(value, REPORT_NOW);

    expect(report.channels.find((item) => item.source === "google_ads_app")).toMatchObject({
      activeMonthlyBudgetEur: null,
      spend7dEur: null,
      status: "unavailable",
    });
    expect(report).toMatchObject({
      actualActiveBudgetEur: 1499.97,
      actualConfiguredBudgetEur: 1499.97,
      budgetVerification: "verified",
    });
  });

  it("keeps zero-plan App spend optional but includes it when present", () => {
    const channels = [
      { source: "google_ads_search", spendTodayEur: 1, spend7dEur: 10 },
      { source: "meta", spendTodayEur: 2, spend7dEur: 20 },
      { source: "linkedin", spendTodayEur: 3, spend7dEur: 30 },
      { source: "google_ads_youtube", spendTodayEur: 4, spend7dEur: 40 },
    ];
    expect(sumPaidChannelSpend(channels, "spend7dEur")).toBe(100);
    expect(sumPaidChannelSpend([...channels, { source: "google_ads_app", spendTodayEur: 0.5, spend7dEur: 5 }], "spend7dEur")).toBe(105);
    expect(sumPaidChannelSpend(channels.map((item) => item.source === "meta" ? { ...item, spend7dEur: null } : item), "spend7dEur")).toBeNull();
  });

  it("marks snapshots older than 24 hours as stale without hiding their values", () => {
    const value = snapshot();
    const fresh = buildMarketingReport(value, new Date("2026-08-29T06:01:00.000Z"));
    const stale = buildMarketingReport(value, new Date("2026-08-29T06:01:00.001Z"));

    expect(fresh.snapshotFreshness).toBe("fresh");
    expect(stale).toMatchObject({
      generatedAt: "2026-08-28T06:01:00.000Z",
      snapshotFreshness: "stale",
      staleAfterHours: 24,
    });
    expect(stale.channels.find((item) => item.source === "meta")).toMatchObject({
      status: "stale",
      spendTodayEur: 0,
      spend7dEur: 12.5,
      resultsToday: 0,
    });
    expect(stale.summary[0]).toContain("Snapshot API non aggiornato");
    expect(stale.summary[2]).toContain("Tracking conversioni non presentato come corrente");
    expect(stale.summary[2]).not.toContain("verificato");
    expect(renderMarketingReportText(stale)).toContain("snapshot del 28 ago 2026, 08:01 · soglia 24 ore");
  });
});

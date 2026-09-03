import { generateKeyPairSync, verify } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectAppStoreReporting,
  collectGooglePlayReporting,
  collectLinkedInReporting,
  collectOtherReporting,
  createAppStoreConnectToken,
  parseAppStoreSalesReport,
  parseGooglePlayInstallsReport,
  parseLinkedInAnalyticsPayload,
  parseLinkedInCampaignBudgets,
} from "@/lib/marketing/other-reporting";

const ENV_NAMES = [
  "LINKEDIN_AD_ACCOUNT_ID",
  "LINKEDIN_ACCESS_TOKEN",
  "LINKEDIN_API_VERSION",
  "LINKEDIN_ACCOUNT_CURRENCY",
  "LINKEDIN_B2B_CAMPAIGN_IDS",
  "APPSTORE_ISSUER_ID",
  "APPSTORE_KEY_ID",
  "APPSTORE_PRIVATE_KEY",
  "APPSTORE_REPORTING_ISSUER_ID",
  "APPSTORE_REPORTING_KEY_ID",
  "APPSTORE_REPORTING_PRIVATE_KEY",
  "APPSTORE_REPORTING_VENDOR_NUMBER",
  "APPSTORE_REPORTING_APP_APPLE_ID",
  "APPSTORE_REPORTING_APP_SKU",
  "APPSTORE_VENDOR_NUMBER",
  "APPSTORE_APP_APPLE_ID",
  "APPSTORE_APP_SKU",
  "GOOGLE_PLAY_REPORT_BUCKET",
  "GOOGLE_PLAY_PACKAGE_NAME",
  "PLAY_SERVICE_ACCOUNT_EMAIL",
  "PLAY_SERVICE_ACCOUNT_KEY",
] as const;

const originalEnv = new Map<string, string | undefined>();

beforeEach(() => {
  for (const name of ENV_NAMES) {
    originalEnv.set(name, process.env[name]);
    delete process.env[name];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const name of ENV_NAMES) {
    const value = originalEnv.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  originalEnv.clear();
});

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function decodeB64url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function appStoreTsv(units = 2): string {
  return [
    "SKU\tProduct Type Identifier\tUnits\tApple Identifier",
    `execlingo\t1F\t${units}\t1234567890`,
    "execlingo\t7F\t99\t1234567890",
    "another-app\t1F\t50\t9999999999",
  ].join("\n");
}

function configureAppStoreReporting() {
  const keyPair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  process.env.APPSTORE_REPORTING_ISSUER_ID = "reporting-issuer-id";
  process.env.APPSTORE_REPORTING_KEY_ID = "REPORT123";
  process.env.APPSTORE_REPORTING_PRIVATE_KEY = keyPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  process.env.APPSTORE_REPORTING_VENDOR_NUMBER = "80012345";
  process.env.APPSTORE_REPORTING_APP_APPLE_ID = "1234567890";
  return keyPair;
}

function googlePlayCsv(): string {
  const rows = ["Date,Package Name,Country,Daily User Installs"];
  for (let day = 22; day <= 28; day += 1) {
    const date = `2026-08-${day}`;
    rows.push(`${date},it.execlingo.app,IT,1`);
    rows.push(`${date},it.execlingo.app,FR,2`);
  }
  return rows.join("\r\n");
}

function completeJulyGooglePlayCsv(): string {
  return [
    "Date,Package Name,Country,Daily User Installs",
    ...Array.from({ length: 7 }, (_, index) => `2026-07-${25 + index},it.execlingo.app,IT,1`),
  ].join("\n");
}

function configureGooglePlayReporting() {
  process.env.GOOGLE_PLAY_REPORT_BUCKET = "pubsite_prod_rev_123";
  process.env.GOOGLE_PLAY_PACKAGE_NAME = "it.execlingo.app";
  process.env.PLAY_SERVICE_ACCOUNT_EMAIL = "reports@example.iam.gserviceaccount.com";
  process.env.PLAY_SERVICE_ACCOUNT_KEY = "not-used-by-injected-provider";
  return vi.fn(async (scope: string) => {
    expect(scope).toBe("https://www.googleapis.com/auth/devstorage.read_only");
    return "storage-token";
  });
}

describe("additional marketing reporting adapters", () => {
  it("returns six N/D rows when provider configuration is absent", async () => {
    const metrics = await collectOtherReporting(new Date("2026-08-28T06:00:00Z"));

    expect(metrics.map((metric) => [metric.source, metric.period])).toEqual([
      ["linkedin", "today"],
      ["linkedin", "last7"],
      ["app_store", "today"],
      ["app_store", "last7"],
      ["google_play", "today"],
      ["google_play", "last7"],
    ]);
    for (const metric of metrics) {
      expect(metric.status).toBe("not_configured");
      expect(metric.spendEur).toBeNull();
      expect(metric.resultCount).toBeNull();
      expect(metric.costPerResult).toBeNull();
    }
  });

  it("parses and sums LinkedIn spend and One Click Lead Gen results", () => {
    expect(parseLinkedInAnalyticsPayload({
      elements: [
        { costInLocalCurrency: "8.20", oneClickLeads: 2 },
        { costInLocalCurrency: "4.10", oneClickLeads: "1" },
      ],
    })).toEqual({ spendAmount: 12.3, leads: 3 });
    expect(parseLinkedInAnalyticsPayload({ elements: [] })).toEqual({ spendAmount: null, leads: null });
  });

  it("calls LinkedIn reporting for today and last7 with bearer auth", async () => {
    process.env.LINKEDIN_AD_ACCOUNT_ID = "123456";
    process.env.LINKEDIN_ACCESS_TOKEN = "secret-token";
    process.env.LINKEDIN_API_VERSION = "202608";
    process.env.LINKEDIN_ACCOUNT_CURRENCY = "EUR";
    process.env.LINKEDIN_B2B_CAMPAIGN_IDS = "10";
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer secret-token");
      expect(new Headers(init?.headers).get("Linkedin-Version")).toBe("202608");
      if (url.includes("/adCampaigns?")) {
        expect(url).toContain("pageSize=1000");
        expect(decodeURIComponent(url)).toContain("DRAFT");
        return Response.json({
          elements: [
            {
              id: 10,
              name: "ExecLingo HR Lead Gen",
              status: "ACTIVE",
              servingStatuses: ["RUNNABLE"],
              dailyBudget: { amount: "9.87", currencyCode: "EUR" },
            },
            {
              id: 11,
              name: "Legacy draft",
              status: "DRAFT",
              dailyBudget: { amount: "2", currencyCode: "EUR" },
            },
          ],
          metadata: {},
        });
      }
      expect(url).toContain("pivot=CAMPAIGN");
      expect(url).toContain("campaigns=List(urn%3Ali%3AsponsoredCampaign%3A10)");
      const isToday = url.includes("start:(year:2026,month:8,day:28)")
        && url.includes("end:(year:2026,month:8,day:28)");
      return Response.json({
        elements: [{
          costInLocalCurrency: isToday ? "3.50" : "14.00",
          oneClickLeads: isToday ? 1 : 2,
        }],
      });
    });

    const metrics = await collectLinkedInReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(metrics[0]).toMatchObject({
      period: "today",
      spendEur: 3.5,
      resultCount: 1,
      costPerResult: 3.5,
      configuredMonthlyBudgetEur: 360.85,
      activeMonthlyBudgetEur: 300.05,
      budgetStatus: "ok",
      status: "ok",
    });
    expect(metrics[1]).toMatchObject({ period: "last7", spendEur: 14, resultCount: 2, costPerResult: 7, status: "ok" });
    expect(metrics[0].campaignBudgets?.map((campaign) => campaign.status)).toEqual(["ACTIVE", "DRAFT"]);
  });

  it("keeps account-wide LinkedIn budgets but returns N/D KPI rows without a B2B allowlist", async () => {
    process.env.LINKEDIN_AD_ACCOUNT_ID = "123456";
    process.env.LINKEDIN_ACCESS_TOKEN = "secret-token";
    process.env.LINKEDIN_API_VERSION = "202608";
    process.env.LINKEDIN_ACCOUNT_CURRENCY = "EUR";
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/adCampaigns?");
      expect(url).not.toContain("/adAnalytics");
      return Response.json({
        elements: [
          {
            id: 10,
            name: "ExecLingo HR Lead Gen",
            status: "ACTIVE",
            dailyBudget: { amount: "9.87", currencyCode: "EUR" },
          },
          {
            id: 11,
            name: "Legacy draft",
            status: "DRAFT",
            dailyBudget: { amount: "2", currencyCode: "EUR" },
          },
        ],
        metadata: {},
      });
    });

    const metrics = await collectLinkedInReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(metrics).toHaveLength(2);
    expect(metrics.every((metric) => metric.status === "not_configured")).toBe(true);
    expect(metrics.every((metric) => metric.spendEur === null && metric.resultCount === null)).toBe(true);
    expect(metrics[0]).toMatchObject({
      configuredMonthlyBudgetEur: 360.85,
      activeMonthlyBudgetEur: 300.05,
      budgetStatus: "ok",
    });
  });

  it("does not turn lifetime or non-EUR LinkedIn caps into monthly EUR budgets", () => {
    const campaigns = parseLinkedInCampaignBudgets([{ elements: [
      {
        id: 21,
        name: "Fixed HR flight",
        status: "ACTIVE",
        dailyBudget: { amount: "10", currencyCode: "EUR" },
        totalBudget: { amount: "300", currencyCode: "EUR" },
      },
      {
        id: 22,
        name: "USD legacy",
        status: "PAUSED",
        dailyBudget: { amount: "5", currencyCode: "USD" },
      },
      { id: 23, name: "Removed", status: "REMOVED", dailyBudget: { amount: "50", currencyCode: "EUR" } },
    ] }]);

    expect(campaigns).toHaveLength(2);
    expect(campaigns[0]).toMatchObject({
      dailyBudgetEur: 10,
      lifetimeBudgetEur: 300,
      monthlyEquivalentEur: null,
      activeMonthlyEquivalentEur: null,
    });
    expect(campaigns[1]).toMatchObject({
      currencyCode: "USD",
      dailyBudgetEur: null,
      monthlyEquivalentEur: null,
      activeMonthlyEquivalentEur: 0,
    });
  });

  it("creates a verifiable ES256 App Store Connect JWT", () => {
    const { publicKey } = configureAppStoreReporting();

    const token = createAppStoreConnectToken(new Date("2026-08-28T06:00:00Z"));
    expect(token).not.toBeNull();
    const [headerPart, payloadPart, signaturePart] = token!.split(".");
    expect(JSON.parse(decodeB64url(headerPart).toString("utf8"))).toMatchObject({ alg: "ES256", kid: "REPORT123" });
    expect(JSON.parse(decodeB64url(payloadPart).toString("utf8"))).toMatchObject({ iss: "reporting-issuer-id", aud: "appstoreconnect-v1" });
    expect(verify(
      "sha256",
      Buffer.from(`${headerPart}.${payloadPart}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      decodeB64url(signaturePart),
    )).toBe(true);
  });

  it("never reuses the legacy IAP key for App Store Connect reporting", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    process.env.APPSTORE_ISSUER_ID = "iap-issuer-id";
    process.env.APPSTORE_KEY_ID = "IAP123";
    process.env.APPSTORE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

    expect(createAppStoreConnectToken(new Date("2026-08-28T06:00:00Z"))).toBeNull();
  });

  it("excludes App Store updates, re-downloads and other apps", () => {
    expect(parseAppStoreSalesReport(appStoreTsv(4), { appleId: "1234567890" })).toBe(4);
    expect(parseAppStoreSalesReport(appStoreTsv(4), { sku: "execlingo" })).toBe(4);
    expect(parseAppStoreSalesReport(appStoreTsv(4), { appleId: "0000000000" })).toBeNull();
  });

  it("uses the latest seven complete App Store days and keeps today delayed", async () => {
    configureAppStoreReporting();
    const compressed = gzipSync(appStoreTsv(2));
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Authorization")).toMatch(/^Bearer /);
      return new Response(toArrayBuffer(compressed), { status: 200, headers: { "Content-Type": "application/a-gzip" } });
    });

    const metrics = await collectAppStoreReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(metrics[0]).toMatchObject({ period: "today", resultCount: null, status: "ok" });
    expect(metrics[1]).toMatchObject({
      period: "last7",
      resultCount: 14,
      coverageStart: "2026-08-21",
      coverageEnd: "2026-08-27",
      status: "ok",
    });
  });

  it("counts an intermediate App Store 404 as zero after validating the selector", async () => {
    configureAppStoreReporting();
    const compressed = gzipSync(appStoreTsv(2));
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const reportDate = new URL(String(input)).searchParams.get("filter[reportDate]");
      return reportDate === "2026-08-24"
        ? new Response(null, { status: 404 })
        : new Response(toArrayBuffer(compressed), { status: 200 });
    });

    const metrics = await collectAppStoreReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(metrics[1]).toMatchObject({
      period: "last7",
      resultCount: 12,
      coverageStart: "2026-08-21",
      coverageEnd: "2026-08-27",
      status: "ok",
    });
    expect(metrics[1].detail).toContain("HTTP 404 del 2026-08-24");
    expect(metrics[1].detail).toContain("zero download");
  });

  it("keeps the most recent App Store 404 unavailable and uses the preceding window", async () => {
    configureAppStoreReporting();
    const compressed = gzipSync(appStoreTsv(2));
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const reportDate = new URL(String(input)).searchParams.get("filter[reportDate]");
      return reportDate === "2026-08-27"
        ? new Response(null, { status: 404 })
        : new Response(toArrayBuffer(compressed), { status: 200 });
    });

    const metrics = await collectAppStoreReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(metrics[1]).toMatchObject({
      resultCount: 14,
      coverageStart: "2026-08-20",
      coverageEnd: "2026-08-26",
      status: "ok",
    });
  });

  it("fails closed when App Store 404s never validate vendor and selector", async () => {
    configureAppStoreReporting();
    const fetcher = vi.fn(async () => new Response(null, { status: 404 }));

    const metrics = await collectAppStoreReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(metrics.every((metric) => metric.status === "error")).toBe(true);
    expect(metrics[0].detail).toContain("nessun Summary Sales report disponibile");
    expect(metrics[0].detail).toContain("configurazione errata");
  });

  it.each([401, 403])("propagates App Store HTTP %i even when seven older days succeeded", async (status) => {
    configureAppStoreReporting();
    const compressed = gzipSync(appStoreTsv(2));
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const reportDate = new URL(String(input)).searchParams.get("filter[reportDate]");
      return reportDate === "2026-08-27"
        ? new Response(null, { status })
        : new Response(toArrayBuffer(compressed), { status: 200 });
    });

    const metrics = await collectAppStoreReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(metrics).toHaveLength(2);
    for (const metric of metrics) {
      expect(metric).toMatchObject({ source: "app_store", status: "error", resultCount: null });
      expect(metric.detail).toContain(`HTTP ${status}`);
    }
  });

  it.each([429, 500])("uses an older complete App Store window after a latest-day HTTP %i", async (status) => {
    configureAppStoreReporting();
    const compressed = gzipSync(appStoreTsv(2));
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const reportDate = new URL(String(input)).searchParams.get("filter[reportDate]");
      return reportDate === "2026-08-27"
        ? new Response(null, { status })
        : new Response(toArrayBuffer(compressed), { status: 200 });
    });

    const metrics = await collectAppStoreReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(metrics[1]).toMatchObject({
      period: "last7",
      resultCount: 14,
      coverageStart: "2026-08-20",
      coverageEnd: "2026-08-26",
      status: "ok",
    });
    expect(metrics[1].detail).toContain(`HTTP ${status}`);
    expect(metrics[1].detail).toContain("finestra completa precedente");
  });

  it("uses an older complete App Store window after a latest-day network failure", async () => {
    configureAppStoreReporting();
    const compressed = gzipSync(appStoreTsv(2));
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const reportDate = new URL(String(input)).searchParams.get("filter[reportDate]");
      if (reportDate === "2026-08-27") throw new TypeError("fetch failed");
      return new Response(toArrayBuffer(compressed), { status: 200 });
    });

    const metrics = await collectAppStoreReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(metrics[1]).toMatchObject({
      resultCount: 14,
      coverageStart: "2026-08-20",
      coverageEnd: "2026-08-26",
      status: "ok",
    });
    expect(metrics[1].detail).toContain("senza risposta HTTP");
  });

  it.each([429, 500])("propagates App Store HTTP %i when it prevents a complete window", async (status) => {
    configureAppStoreReporting();
    const compressed = gzipSync(appStoreTsv(2));
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const reportDate = new URL(String(input)).searchParams.get("filter[reportDate]");
      return reportDate === "2026-08-24"
        ? new Response(null, { status })
        : new Response(toArrayBuffer(compressed), { status: 200 });
    });

    const metrics = await collectAppStoreReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(metrics.every((metric) => metric.status === "error")).toBe(true);
    expect(metrics[0].detail).toContain(`2026-08-24: App Store Connect`);
    expect(metrics[0].detail).toContain(`HTTP ${status}`);
  });

  it("propagates an App Store network failure when it prevents a complete window", async () => {
    configureAppStoreReporting();
    const compressed = gzipSync(appStoreTsv(2));
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const reportDate = new URL(String(input)).searchParams.get("filter[reportDate]");
      if (reportDate === "2026-08-24") throw new TypeError("fetch failed");
      return new Response(toArrayBuffer(compressed), { status: 200 });
    });

    const metrics = await collectAppStoreReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(metrics.every((metric) => metric.status === "error")).toBe(true);
    expect(metrics[0].detail).toContain("2026-08-24");
    expect(metrics[0].detail).toContain("senza risposta HTTP");
  });

  it("reports a configured Apple ID that never matches as an error, not zero downloads", async () => {
    configureAppStoreReporting();
    process.env.APPSTORE_REPORTING_APP_APPLE_ID = "0000000000";
    const compressed = gzipSync(appStoreTsv(2));
    const fetcher = vi.fn(async () => new Response(toArrayBuffer(compressed), { status: 200 }));

    const metrics = await collectAppStoreReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(metrics).toHaveLength(2);
    for (const metric of metrics) {
      expect(metric).toMatchObject({ source: "app_store", status: "error", resultCount: null });
      expect(metric.detail).toContain("Apple ID configurato non presente");
    }
  });

  it("treats selector-missing days as zero only after the app matched another available report", async () => {
    configureAppStoreReporting();
    const matching = gzipSync(appStoreTsv(2));
    const otherOnly = gzipSync([
      "SKU\tProduct Type Identifier\tUnits\tApple Identifier",
      "another-app\t1F\t50\t9999999999",
    ].join("\n"));
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const reportDate = new URL(String(input)).searchParams.get("filter[reportDate]");
      const body = reportDate === "2026-08-27" ? matching : otherOnly;
      return new Response(toArrayBuffer(body), { status: 200 });
    });

    const metrics = await collectAppStoreReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(metrics[1]).toMatchObject({
      period: "last7",
      resultCount: 2,
      coverageStart: "2026-08-21",
      coverageEnd: "2026-08-27",
      status: "ok",
    });
  });

  it("parses Google Play country rows without duplicating dates", () => {
    expect(Object.fromEntries(parseGooglePlayInstallsReport(googlePlayCsv(), "it.execlingo.app") ?? [])).toMatchObject({
      "2026-08-22": 3,
      "2026-08-28": 3,
    });
  });

  it("downloads the official Google Play GCS report with storage read-only scope", async () => {
    const tokenProvider = configureGooglePlayReporting();
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(googlePlayCsv(), "utf16le")]);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain("stats%2Finstalls%2Finstalls_it.execlingo.app_202608_country.csv");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer storage-token");
      return new Response(toArrayBuffer(utf16), { status: 200 });
    });

    const metrics = await collectGooglePlayReporting(
      new Date("2026-08-28T06:00:00Z"), fetcher, tokenProvider,
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(tokenProvider).toHaveBeenCalledTimes(1);
    expect(metrics[0]).toMatchObject({ period: "today", resultCount: null, status: "ok" });
    expect(metrics[1]).toMatchObject({
      period: "last7",
      resultCount: 21,
      coverageStart: "2026-08-22",
      coverageEnd: "2026-08-28",
      status: "ok",
    });
  });

  it.each([401, 403])("keeps Google Play GCS HTTP %i hard even with another complete month", async (status) => {
    const tokenProvider = configureGooglePlayReporting();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).includes("_202608_")
      ? new Response("", { status })
      : new Response(completeJulyGooglePlayCsv(), { status: 200 }));

    const metrics = await collectGooglePlayReporting(
      new Date("2026-08-01T06:00:00Z"), fetcher, tokenProvider,
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(metrics).toHaveLength(2);
    for (const metric of metrics) {
      expect(metric).toMatchObject({ source: "google_play", status: "error", resultCount: null });
      expect(metric.detail).toContain(`HTTP ${status}`);
      expect(metric.detail).toContain("202608");
    }
  });

  it("uses a successful Google Play month when the newer monthly report is still 404", async () => {
    const tokenProvider = configureGooglePlayReporting();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).includes("_202608_")
      ? new Response("", { status: 404 })
      : new Response(completeJulyGooglePlayCsv(), { status: 200 }));

    const metrics = await collectGooglePlayReporting(
      new Date("2026-08-01T06:00:00Z"), fetcher, tokenProvider,
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(metrics[1]).toMatchObject({
      period: "last7",
      resultCount: 7,
      coverageStart: "2026-07-25",
      coverageEnd: "2026-07-31",
      status: "ok",
    });
    expect(metrics[1].detail).toContain("202608");
    expect(metrics[1].detail).toContain("HTTP 404");
  });

  it.each([500, 503])("uses a successful Google Play month after transient HTTP %i from another month", async (status) => {
    const tokenProvider = configureGooglePlayReporting();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).includes("_202608_")
      ? new Response("", { status })
      : new Response(completeJulyGooglePlayCsv(), { status: 200 }));

    const metrics = await collectGooglePlayReporting(
      new Date("2026-08-01T06:00:00Z"), fetcher, tokenProvider,
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(metrics[1]).toMatchObject({
      period: "last7",
      resultCount: 7,
      coverageStart: "2026-07-25",
      coverageEnd: "2026-07-31",
      status: "ok",
    });
    expect(metrics[1].detail).toContain(`HTTP ${status}`);
    expect(metrics[1].detail).toContain("202608");
  });

  it("uses a successful Google Play month after a network failure from another month", async () => {
    const tokenProvider = configureGooglePlayReporting();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("_202608_")) throw new TypeError("fetch failed");
      return new Response(completeJulyGooglePlayCsv(), { status: 200 });
    });

    const metrics = await collectGooglePlayReporting(
      new Date("2026-08-01T06:00:00Z"), fetcher, tokenProvider,
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(metrics[1]).toMatchObject({
      resultCount: 7,
      coverageStart: "2026-07-25",
      coverageEnd: "2026-07-31",
      status: "ok",
    });
    expect(metrics[1].detail).toContain("errore di rete o lettura");
    expect(metrics[1].detail).toContain("202608");
  });

  it.each([500, 503])("surfaces Google Play GCS HTTP %i when no complete window remains", async (status) => {
    const tokenProvider = configureGooglePlayReporting();
    const fetcher = vi.fn(async () => new Response("", { status }));

    const metrics = await collectGooglePlayReporting(
      new Date("2026-08-28T06:00:00Z"), fetcher, tokenProvider,
    );

    expect(metrics.every((metric) => metric.status === "error")).toBe(true);
    expect(metrics[0].detail).toContain(`HTTP ${status}`);
  });

  it("keeps Google Play N/D when monthly 404s leave no complete window", async () => {
    const tokenProvider = configureGooglePlayReporting();
    const fetcher = vi.fn(async () => new Response("", { status: 404 }));

    const metrics = await collectGooglePlayReporting(
      new Date("2026-08-28T06:00:00Z"), fetcher, tokenProvider,
    );

    expect(metrics[0]).toMatchObject({ period: "today", status: "ok", resultCount: null });
    expect(metrics[1]).toMatchObject({ period: "last7", status: "ok", resultCount: null });
    expect(metrics[1].detail).toContain("HTTP 404");
    expect(metrics[1].detail).toContain("ritardo di pubblicazione");
  });

  it("surfaces Google Play GCS network failures as an error", async () => {
    const tokenProvider = configureGooglePlayReporting();
    const fetcher = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    const metrics = await collectGooglePlayReporting(
      new Date("2026-08-28T06:00:00Z"), fetcher, tokenProvider,
    );

    expect(metrics.every((metric) => metric.status === "error")).toBe(true);
    expect(metrics[0].detail).toContain("errore di rete o lettura");
  });

  it("keeps an invalid Google Play CSV hard even with another complete month", async () => {
    const tokenProvider = configureGooglePlayReporting();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).includes("_202608_")
      ? new Response(
        "Date,Package Name,Country\n2026-08-01,it.execlingo.app,IT",
        { status: 200 },
      )
      : new Response(completeJulyGooglePlayCsv(), { status: 200 }));

    const metrics = await collectGooglePlayReporting(
      new Date("2026-08-01T06:00:00Z"), fetcher, tokenProvider,
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(metrics.every((metric) => metric.status === "error")).toBe(true);
    expect(metrics[0].detail).toContain("CSV non valido");
  });

  it("keeps N/D for normal report lag when the available CSV is valid", async () => {
    const tokenProvider = configureGooglePlayReporting();
    const fetcher = vi.fn(async () => new Response(
      "Date,Package Name,Country,Daily User Installs\n2026-08-27,it.execlingo.app,IT,2",
      { status: 200 },
    ));

    const metrics = await collectGooglePlayReporting(
      new Date("2026-08-28T06:00:00Z"), fetcher, tokenProvider,
    );

    expect(metrics[0]).toMatchObject({ period: "today", status: "ok", resultCount: null });
    expect(metrics[1]).toMatchObject({ period: "last7", status: "ok", resultCount: null });
    expect(metrics[1].detail).toContain("sette giornate contigue");
  });
});

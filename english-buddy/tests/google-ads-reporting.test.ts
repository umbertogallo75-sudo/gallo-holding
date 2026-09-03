import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectGoogleAdsReporting,
  parseGoogleAdsCampaignBudgetsPayload,
} from "@/lib/marketing/google-ads-reporting";

const ENV_NAMES = [
  "GOOGLE_ADS_CUSTOMER_ID",
  "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
  "PLAY_SERVICE_ACCOUNT_EMAIL",
  "PLAY_SERVICE_ACCOUNT_KEY",
  "GOOGLE_ADS_SEARCH_CAMPAIGN_IDS",
  "GOOGLE_ADS_YOUTUBE_CAMPAIGN_IDS",
  "GOOGLE_ADS_APP_CAMPAIGN_IDS",
  "GOOGLE_ADS_REGISTRATION_ACTION_IDS",
  "GOOGLE_ADS_APP_REGISTRATION_ACTION_IDS",
] as const;

const originalEnv = new Map<string, string | undefined>();

beforeEach(() => {
  for (const name of ENV_NAMES) {
    originalEnv.set(name, process.env[name]);
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of ENV_NAMES) {
    const value = originalEnv.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  originalEnv.clear();
  vi.restoreAllMocks();
});

function configureGoogleAds() {
  process.env.GOOGLE_ADS_CUSTOMER_ID = "123-456-7890";
  process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = "987-654-3210";
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "developer-secret";
  process.env.GOOGLE_ADS_CLIENT_ID = "oauth-client";
  process.env.GOOGLE_ADS_CLIENT_SECRET = "oauth-secret";
  process.env.GOOGLE_ADS_REFRESH_TOKEN = "refresh-secret";
  process.env.GOOGLE_ADS_SEARCH_CAMPAIGN_IDS = "100,102";
  process.env.GOOGLE_ADS_YOUTUBE_CAMPAIGN_IDS = "200";
  process.env.GOOGLE_ADS_APP_CAMPAIGN_IDS = "300";
  process.env.GOOGLE_ADS_REGISTRATION_ACTION_IDS = "900";
  process.env.GOOGLE_ADS_APP_REGISTRATION_ACTION_IDS = "902";
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Google Ads reporting adapter", () => {
  it("returns nullable not_configured rows without making network calls", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const rows = await collectGoogleAdsReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(fetcher).not.toHaveBeenCalled();
    expect(rows.map((row) => [row.period, row.channel])).toEqual([
      ["today", "search"],
      ["today", "youtube"],
      ["today", "app"],
      ["last7", "search"],
      ["last7", "youtube"],
      ["last7", "app"],
    ]);
    for (const row of rows) {
      expect(row.status).toBe("not_configured");
      expect(row.spendEur).toBeNull();
      expect(row.registrations).toBeNull();
      expect(row.costPerRegistration).toBeNull();
    }
  });

  it("uses the service account with the Google Ads scope when no refresh token exists", async () => {
    process.env.GOOGLE_ADS_CUSTOMER_ID = "123-456-7890";
    process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = "987-654-3210";
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "developer-secret";
    process.env.PLAY_SERVICE_ACCOUNT_EMAIL = "reports@example.iam.gserviceaccount.com";
    process.env.PLAY_SERVICE_ACCOUNT_KEY = "configured-private-key";
    process.env.GOOGLE_ADS_SEARCH_CAMPAIGN_IDS = "100";
    process.env.GOOGLE_ADS_YOUTUBE_CAMPAIGN_IDS = "200";
    process.env.GOOGLE_ADS_APP_CAMPAIGN_IDS = "300";
    process.env.GOOGLE_ADS_REGISTRATION_ACTION_IDS = "900";
    process.env.GOOGLE_ADS_APP_REGISTRATION_ACTION_IDS = "902";
    const serviceAccountTokenProvider = vi.fn(async (scope: string) => {
      expect(scope).toBe("https://www.googleapis.com/auth/adwords");
      return "service-account-access-token";
    });
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(
        "https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream"
      );
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer service-account-access-token");
      expect(headers["developer-token"]).toBe("developer-secret");
      expect(headers["login-customer-id"]).toBe("9876543210");
      return jsonResponse([]);
    });

    const rows = await collectGoogleAdsReporting(
      new Date("2026-08-28T06:00:00Z"),
      fetcher,
      serviceAccountTokenProvider
    );

    expect(serviceAccountTokenProvider).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(rows.every((row) => row.status === "ok")).toBe(true);
  });

  it("requires either refresh-token OAuth or a configured service account", async () => {
    process.env.GOOGLE_ADS_CUSTOMER_ID = "123-456-7890";
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "developer-secret";
    const fetcher = vi.fn<typeof fetch>();
    const serviceAccountTokenProvider = vi.fn(async () => "must-not-run");

    const rows = await collectGoogleAdsReporting(
      new Date("2026-08-28T06:00:00Z"),
      fetcher,
      serviceAccountTokenProvider
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(serviceAccountTokenProvider).not.toHaveBeenCalled();
    expect(rows.every((row) => row.status === "not_configured")).toBe(true);
    expect(rows[0].detail).toContain("GOOGLE_ADS_REFRESH_TOKEN oppure PLAY_SERVICE_ACCOUNT_EMAIL/PLAY_SERVICE_ACCOUNT_KEY");
  });

  it("keeps refresh-token OAuth ahead of the service-account fallback", async () => {
    configureGoogleAds();
    process.env.PLAY_SERVICE_ACCOUNT_EMAIL = "reports@example.iam.gserviceaccount.com";
    process.env.PLAY_SERVICE_ACCOUNT_KEY = "configured-private-key";
    const serviceAccountTokenProvider = vi.fn(async () => "must-not-run");
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input) === "https://oauth2.googleapis.com/token") {
        expect(String(init?.body)).toContain("refresh_token=refresh-secret");
        return jsonResponse({ access_token: "refresh-token-access" });
      }
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer refresh-token-access");
      return jsonResponse([]);
    });

    await collectGoogleAdsReporting(
      new Date("2026-08-28T06:00:00Z"),
      fetcher,
      serviceAccountTokenProvider
    );

    expect(serviceAccountTokenProvider).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it("falls back to the shared Google OAuth client", async () => {
    configureGoogleAds();
    delete process.env.GOOGLE_ADS_CLIENT_ID;
    delete process.env.GOOGLE_ADS_CLIENT_SECRET;
    process.env.GOOGLE_CLIENT_ID = "shared-google-client";
    process.env.GOOGLE_CLIENT_SECRET = "shared-google-secret";
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("client_id")).toBe("shared-google-client");
      expect(body.get("client_secret")).toBe("shared-google-secret");
      return jsonResponse({ error: "invalid_grant" }, 400);
    });

    const rows = await collectGoogleAdsReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(rows.every((row) => row.status === "error")).toBe(true);
  });

  it("prefers the Google Ads OAuth client over the shared fallback", async () => {
    configureGoogleAds();
    process.env.GOOGLE_CLIENT_ID = "shared-google-client";
    process.env.GOOGLE_CLIENT_SECRET = "shared-google-secret";
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("client_id")).toBe("oauth-client");
      expect(body.get("client_secret")).toBe("oauth-secret");
      return jsonResponse({ error: "invalid_grant" }, 400);
    });

    await collectGoogleAdsReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refreshes OAuth once and aggregates Search, YouTube and App registration KPIs", async () => {
    configureGoogleAds();
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        expect(String(init?.body)).toContain("grant_type=refresh_token");
        return jsonResponse({ access_token: "short-lived-access-token", expires_in: 3600 });
      }

      expect(url).toBe("https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream");
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer short-lived-access-token");
      expect(headers["developer-token"]).toBe("developer-secret");
      expect(headers["login-customer-id"]).toBe("9876543210");

      const query = JSON.parse(String(init?.body)).query as string;
      expect(query).toContain("'MULTI_CHANNEL'");
      expect(query).toContain("'DEMAND_GEN'");
      const isLast7 = query.includes("BETWEEN '2026-08-22' AND '2026-08-28'");
      const isRegistrations = query.includes("segments.conversion_action,");
      if (query.includes("campaign_budget.amount_micros")) {
        return jsonResponse([{ results: [
          {
            campaign: { id: "100", name: "ExecLingo Search", advertisingChannelType: "SEARCH", status: "ENABLED" },
            customer: { currencyCode: "EUR" },
            campaignBudget: { id: "10", name: "Search daily", period: "DAILY", amountMicros: "19670000" },
          },
          {
            campaign: { id: "101", name: "Legacy Search", advertisingChannelType: "SEARCH", status: "PAUSED" },
            customer: { currencyCode: "EUR" },
            campaignBudget: { id: "11", name: "Legacy daily", period: "DAILY", amountMicros: "4000000" },
          },
          {
            campaign: { id: "102", name: "Search shared", advertisingChannelType: "SEARCH", status: "ENABLED" },
            customer: { currencyCode: "EUR" },
            campaignBudget: { id: "10", name: "Search daily", period: "DAILY", amountMicros: "19670000" },
          },
          {
            campaign: { id: "200", name: "ExecLingo Demand Gen", advertisingChannelType: "DEMAND_GEN", status: "ENABLED" },
            customer: { currencyCode: "EUR" },
            campaignBudget: { id: "20", name: "Video daily", period: "DAILY", amountMicros: "5000000" },
          },
          {
            campaign: { id: "300", name: "ExecLingo Android", advertisingChannelType: "MULTI_CHANNEL", status: "PAUSED" },
            customer: { currencyCode: "EUR" },
            campaignBudget: { id: "30", name: "App daily", period: "DAILY", amountMicros: "2000000" },
          },
        ] }]);
      }
      if (isRegistrations) {
        return jsonResponse([{ results: [
          {
            campaign: { id: "100", advertisingChannelType: "SEARCH" },
            segments: { conversionAction: "customers/1234567890/conversionActions/900" },
            metrics: { conversions: isLast7 ? "7" : "2" },
          },
          {
            campaign: { id: "101", advertisingChannelType: "SEARCH" },
            segments: { conversionAction: "customers/1234567890/conversionActions/900" },
            metrics: { conversions: "50" },
          },
          {
            campaign: { id: "100", advertisingChannelType: "SEARCH" },
            segments: { conversionAction: "customers/1234567890/conversionActions/901" },
            metrics: { conversions: "50" },
          },
          {
            campaign: { id: "200", advertisingChannelType: "DEMAND_GEN" },
            segments: { conversionAction: "customers/1234567890/conversionActions/900" },
            metrics: { conversions: "0" },
          },
          {
            campaign: { id: "300", advertisingChannelType: "MULTI_CHANNEL" },
            segments: { conversionAction: "customers/1234567890/conversionActions/902" },
            metrics: { conversions: isLast7 ? "3" : "1" },
          },
          {
            campaign: { id: "300", advertisingChannelType: "MULTI_CHANNEL" },
            segments: { conversionAction: "customers/1234567890/conversionActions/900" },
            metrics: { conversions: "99" },
          },
        ] }]);
      }
      return jsonResponse([{ results: [
        {
          campaign: { id: "100", advertisingChannelType: "SEARCH", status: "ENABLED" },
          customer: { currencyCode: "EUR" },
          metrics: { costMicros: isLast7 ? "70000000" : "12500000" },
        },
        {
          campaign: { id: "101", advertisingChannelType: "SEARCH", status: "PAUSED" },
          customer: { currencyCode: "EUR" },
          metrics: { costMicros: "99000000" },
        },
        {
          campaign: { id: "200", advertisingChannelType: "DEMAND_GEN", status: "ENABLED" },
          customer: { currencyCode: "EUR" },
          metrics: { costMicros: isLast7 ? "21000000" : "5000000" },
        },
        {
          campaign: { id: "300", advertisingChannelType: "MULTI_CHANNEL", status: "PAUSED" },
          customer: { currencyCode: "EUR" },
          metrics: { costMicros: isLast7 ? "7000000" : "1000000" },
        },
      ] }]);
    });

    const rows = await collectGoogleAdsReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(rows).toEqual([
      expect.objectContaining({
        channel: "search",
        period: "today",
        spendEur: 12.5,
        registrations: 2,
        costPerRegistration: 6.25,
        campaignStatus: "enabled",
        configuredMonthlyBudgetEur: 719.57,
        activeMonthlyBudgetEur: 597.97,
        budgetStatus: "ok",
        status: "ok",
      }),
      expect.objectContaining({
        channel: "youtube",
        period: "today",
        spendEur: 5,
        registrations: 0,
        costPerRegistration: null,
        campaignStatus: "enabled",
        configuredMonthlyBudgetEur: 152,
        activeMonthlyBudgetEur: 152,
        status: "ok",
      }),
      expect.objectContaining({
        channel: "app",
        period: "today",
        spendEur: 1,
        registrations: 1,
        costPerRegistration: 1,
        campaignStatus: "paused",
        configuredMonthlyBudgetEur: 60.8,
        activeMonthlyBudgetEur: 0,
        status: "ok",
      }),
      expect.objectContaining({
        channel: "search",
        period: "last7",
        spendEur: 70,
        registrations: 7,
        costPerRegistration: 10,
      }),
      expect.objectContaining({
        channel: "youtube",
        period: "last7",
        spendEur: 21,
        registrations: 0,
        costPerRegistration: null,
      }),
      expect.objectContaining({
        channel: "app",
        period: "last7",
        spendEur: 7,
        registrations: 3,
        costPerRegistration: 2.33,
      }),
    ]);
    expect(rows.map((row) => row.detail).join(" ")).not.toContain("short-lived-access-token");
    expect(rows.map((row) => row.detail).join(" ")).not.toContain("developer-secret");
    expect(rows[0].campaignBudgets?.map((campaign) => [campaign.campaignName, campaign.status])).toEqual([
      ["ExecLingo Search", "ENABLED"],
      ["Legacy Search", "PAUSED"],
      ["Search shared", "ENABLED"],
    ]);
  });

  it("keeps lifetime and non-EUR budgets separate from the monthly equivalent", () => {
    const campaigns = parseGoogleAdsCampaignBudgetsPayload([{ results: [
      {
        campaign: { id: "300", name: "Fixed flight", advertisingChannelType: "VIDEO", status: "ENABLED" },
        customer: { currencyCode: "EUR" },
        campaignBudget: { id: "30", period: "CUSTOM_PERIOD", totalAmountMicros: "90000000" },
      },
      {
        campaign: { id: "301", name: "USD Search", advertisingChannelType: "SEARCH", status: "PAUSED" },
        customer: { currencyCode: "USD" },
        campaignBudget: { id: "31", period: "DAILY", amountMicros: "10000000" },
      },
      {
        campaign: { id: "999", name: "Removed", advertisingChannelType: "SEARCH", status: "REMOVED" },
      },
    ] }]);

    expect(campaigns).toHaveLength(2);
    expect(campaigns[0]).toMatchObject({
      lifetimeBudgetEur: 90,
      dailyBudgetEur: null,
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

  it("keeps absent metrics null while preserving explicit zero values", async () => {
    configureGoogleAds();
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).includes("oauth2.googleapis.com")) return jsonResponse({ access_token: "token" });
      const query = JSON.parse(String(init?.body)).query as string;
      if (query.includes("campaign_budget.amount_micros")) {
        return jsonResponse([{ results: [
          {
            campaign: { id: "100", advertisingChannelType: "SEARCH", status: "ENABLED" },
            customer: { currencyCode: "EUR" },
            campaignBudget: { id: "10", period: "DAILY", amountMicros: "19670000" },
          },
          {
            campaign: { id: "200", advertisingChannelType: "VIDEO", status: "ENABLED" },
            customer: { currencyCode: "EUR" },
            campaignBudget: { id: "20", period: "DAILY", amountMicros: "5000000" },
          },
        ] }]);
      }
      if (query.includes("segments.conversion_action,")) {
        return jsonResponse([{ results: [
          {
            campaign: { id: "100", advertisingChannelType: "SEARCH" },
            segments: { conversionAction: "customers/1234567890/conversionActions/900" },
            metrics: { conversions: "0" },
          },
        ] }]);
      }
      return jsonResponse([{ results: [
        {
          campaign: { id: "100", advertisingChannelType: "SEARCH", status: "ENABLED" },
          customer: { currencyCode: "EUR" },
          metrics: { costMicros: "0" },
        },
        {
          campaign: { id: "200", advertisingChannelType: "VIDEO", status: "ENABLED" },
          customer: { currencyCode: "EUR" },
          metrics: {},
        },
      ] }]);
    });

    const rows = await collectGoogleAdsReporting(new Date("2026-08-28T06:00:00Z"), fetcher);
    const search = rows.find((row) => row.period === "today" && row.channel === "search");
    const youtube = rows.find((row) => row.period === "today" && row.channel === "youtube");

    expect(search).toMatchObject({ spendEur: 0, registrations: 0, costPerRegistration: null });
    expect(youtube).toMatchObject({ spendEur: null, registrations: null, costPerRegistration: null });
  });

  it("keeps account-wide budgets but returns N/D KPI rows when attribution allowlists are absent", async () => {
    configureGoogleAds();
    delete process.env.GOOGLE_ADS_SEARCH_CAMPAIGN_IDS;
    delete process.env.GOOGLE_ADS_YOUTUBE_CAMPAIGN_IDS;
    delete process.env.GOOGLE_ADS_APP_CAMPAIGN_IDS;
    delete process.env.GOOGLE_ADS_REGISTRATION_ACTION_IDS;
    delete process.env.GOOGLE_ADS_APP_REGISTRATION_ACTION_IDS;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).includes("oauth2.googleapis.com")) return jsonResponse({ access_token: "token" });
      const query = JSON.parse(String(init?.body)).query as string;
      expect(query).toContain("campaign_budget.amount_micros");
      return jsonResponse([{ results: [
        {
          campaign: { id: "100", name: "ExecLingo Search", advertisingChannelType: "SEARCH", status: "ENABLED" },
          customer: { currencyCode: "EUR" },
          campaignBudget: { id: "10", period: "DAILY", amountMicros: "19670000" },
        },
        {
          campaign: { id: "101", name: "Legacy Search", advertisingChannelType: "SEARCH", status: "PAUSED" },
          customer: { currencyCode: "EUR" },
          campaignBudget: { id: "11", period: "DAILY", amountMicros: "4000000" },
        },
        {
          campaign: { id: "200", name: "ExecLingo Video", advertisingChannelType: "VIDEO", status: "ENABLED" },
          customer: { currencyCode: "EUR" },
          campaignBudget: { id: "20", period: "DAILY", amountMicros: "5000000" },
        },
        {
          campaign: { id: "300", name: "ExecLingo Android", advertisingChannelType: "MULTI_CHANNEL", status: "PAUSED" },
          customer: { currencyCode: "EUR" },
          campaignBudget: { id: "30", period: "DAILY", amountMicros: "2000000" },
        },
      ] }]);
    });

    const rows = await collectGoogleAdsReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(rows.every((row) => row.status === "not_configured")).toBe(true);
    expect(rows.every((row) => row.spendEur === null && row.registrations === null)).toBe(true);
    expect(rows.find((row) => row.period === "today" && row.channel === "search")).toMatchObject({
      configuredMonthlyBudgetEur: 719.57,
      activeMonthlyBudgetEur: 597.97,
      budgetStatus: "ok",
    });
    expect(rows.find((row) => row.period === "today" && row.channel === "youtube")).toMatchObject({
      configuredMonthlyBudgetEur: 152,
      activeMonthlyBudgetEur: 152,
      budgetStatus: "ok",
    });
    expect(rows.find((row) => row.period === "today" && row.channel === "app")).toMatchObject({
      configuredMonthlyBudgetEur: 60.8,
      activeMonthlyBudgetEur: 0,
      budgetStatus: "ok",
    });
  });

  it("returns diagnostic errors without exposing OAuth secrets", async () => {
    configureGoogleAds();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: "invalid_grant" }, 400));

    const rows = await collectGoogleAdsReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(rows.every((row) => row.status === "error")).toBe(true);
    expect(rows.every((row) => row.spendEur === null && row.registrations === null)).toBe(true);
    expect(rows.map((row) => row.detail).join(" ")).toBe(
      new Array(6).fill("OAuth Google Ads: HTTP 400.").join(" ")
    );
    expect(rows.map((row) => row.detail).join(" ")).not.toContain("refresh-secret");
  });
});

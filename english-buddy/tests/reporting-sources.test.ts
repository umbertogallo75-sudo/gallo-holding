import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectExternalReporting,
  collectMetaReporting,
  ga4WebSignupReportBody,
  parseGa4ReportingPayload,
  parseMetaCampaignBudgets,
  parseMetaInsightsPayload,
} from "@/lib/marketing/reporting-sources";

const REPORTING_ENV = [
  "GA4_PROPERTY_ID",
  "PLAY_SERVICE_ACCOUNT_EMAIL",
  "PLAY_SERVICE_ACCOUNT_KEY",
  "META_AD_ACCOUNT_ID",
  "META_ACCESS_TOKEN",
  "META_GRAPH_API_VERSION",
  "META_CAMPAIGN_IDS",
] as const;

const originalEnv = new Map<string, string | undefined>();

beforeEach(() => {
  for (const name of REPORTING_ENV) {
    originalEnv.set(name, process.env[name]);
    delete process.env[name];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const name of REPORTING_ENV) {
    const value = originalEnv.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  originalEnv.clear();
});

describe("external marketing reporting sources", () => {
  it("returns not_configured rows, never zero placeholders, when credentials are absent", async () => {
    const metrics = await collectExternalReporting(new Date("2026-08-28T06:00:00Z"));

    expect(metrics).toHaveLength(4);
    expect(metrics.map((metric) => [metric.source, metric.period])).toEqual([
      ["ga4", "today"],
      ["ga4", "last7"],
      ["meta", "today"],
      ["meta", "last7"],
    ]);
    for (const metric of metrics) {
      expect(metric.status).toBe("not_configured");
      expect(metric.spendEur).toBeNull();
      expect(metric.resultCount).toBeNull();
      expect(metric.costPerResult).toBeNull();
    }
  });

  it("parses GA4 sign_up event count and unique users", () => {
    expect(parseGa4ReportingPayload({
      rows: [{ metricValues: [{ value: "23" }, { value: "18" }] }],
    })).toEqual({ spendEur: null, resultCount: 23, users: 18 });
  });

  it("keeps the GA4 web signup report isolated from native app streams", () => {
    expect(ga4WebSignupReportBody({ startDate: "2026-08-28", endDate: "2026-08-28" })).toEqual({
      dateRanges: [{ startDate: "2026-08-28", endDate: "2026-08-28" }],
      metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            {
              filter: {
                fieldName: "eventName",
                stringFilter: { matchType: "EXACT", value: "sign_up", caseSensitive: true },
              },
            },
            {
              filter: {
                fieldName: "platform",
                stringFilter: { matchType: "EXACT", value: "web", caseSensitive: true },
              },
            },
          ],
        },
      },
    });
  });

  it("does not invent GA4 values for an empty response", () => {
    expect(parseGa4ReportingPayload({ rows: [] })).toEqual({
      spendEur: null,
      resultCount: null,
      users: null,
    });
  });

  it("parses and sums Meta spend and CompleteRegistration actions", () => {
    expect(parseMetaInsightsPayload({
      data: [
        {
          spend: "8.20",
          actions: [
            { action_type: "link_click", value: "14" },
            { action_type: "offsite_conversion.fb_pixel_complete_registration", value: "2" },
          ],
        },
        {
          spend: "4.10",
          actions: [{ action_type: "complete_registration", value: "1" }],
        },
      ],
    })).toEqual({ spendEur: 12.3, resultCount: 3, users: null });
  });

  it("filters Meta Insights to explicitly allowed campaign IDs", () => {
    expect(parseMetaInsightsPayload({
      data: [
        {
          campaign_id: "1",
          spend: "2.50",
          actions: [{ action_type: "complete_registration", value: "1" }],
        },
        {
          campaign_id: "2",
          spend: "99.00",
          actions: [{ action_type: "complete_registration", value: "50" }],
        },
      ],
    }, new Set(["1"]))).toEqual({ spendEur: 2.5, resultCount: 1, users: null });
  });

  it("keeps a missing Meta registration action nullable", () => {
    expect(parseMetaInsightsPayload({ data: [{ spend: "3.50", actions: [] }] })).toEqual({
      spendEur: 3.5,
      resultCount: null,
      users: null,
    });
  });

  it("joins Meta campaign and ad-set budgets without double counting", () => {
    const campaigns = parseMetaCampaignBudgets(
      [{ data: [
        { id: "1", name: "CBO live", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "1480" },
        { id: "2", name: "ABO live", status: "ACTIVE", effective_status: "ACTIVE" },
        { id: "3", name: "Lifetime draft", status: "PAUSED", effective_status: "PAUSED", lifetime_budget: "30000" },
        { id: "4", name: "Deleted", status: "DELETED", effective_status: "DELETED", daily_budget: "99900" },
      ] }],
      [{ data: [
        { id: "20", campaign_id: "2", name: "ABO active", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "500" },
        { id: "21", campaign_id: "2", name: "ABO paused", status: "PAUSED", effective_status: "PAUSED", daily_budget: "200" },
      ] }],
      "EUR",
    );

    expect(campaigns).toHaveLength(3);
    expect(campaigns[0]).toMatchObject({
      budgetLevel: "campaign",
      dailyBudgetEur: 14.8,
      monthlyEquivalentEur: 449.92,
      activeMonthlyEquivalentEur: 449.92,
    });
    expect(campaigns[1]).toMatchObject({
      budgetLevel: "ad_set",
      dailyBudgetEur: 7,
      monthlyEquivalentEur: 212.8,
      activeMonthlyEquivalentEur: 152,
    });
    expect(campaigns[2]).toMatchObject({
      lifetimeBudgetEur: 300,
      monthlyEquivalentEur: null,
      activeMonthlyEquivalentEur: 0,
    });
  });

  it("reads Meta account currency and all non-deleted campaign budgets", async () => {
    process.env.META_AD_ACCOUNT_ID = "123456";
    process.env.META_ACCESS_TOKEN = "meta-secret";
    process.env.META_GRAPH_API_VERSION = "v25.0";
    process.env.META_CAMPAIGN_IDS = "1";
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer meta-secret");
      if (url.includes("/campaigns?")) {
        return Response.json({ data: [
          { id: "1", name: "ExecLingo B2C", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "1480" },
          { id: "2", name: "Legacy", status: "PAUSED", effective_status: "PAUSED", daily_budget: "100" },
        ] });
      }
      if (url.includes("/adsets?")) return Response.json({ data: [] });
      if (url.includes("/insights?")) {
        expect(url).toContain("level=campaign");
        expect(url).toContain("campaign_id%2Cspend%2Cactions");
        return Response.json({ data: [
          {
            campaign_id: "1",
            spend: "2.50",
            actions: [{ action_type: "complete_registration", value: "1" }],
          },
          {
            campaign_id: "2",
            spend: "90.00",
            actions: [{ action_type: "complete_registration", value: "30" }],
          },
        ] });
      }
      expect(url).toContain("act_123456?fields=currency");
      return Response.json({ currency: "EUR" });
    });

    const metrics = await collectMetaReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(metrics[0]).toMatchObject({
      currencyCode: "EUR",
      spendEur: 2.5,
      resultCount: 1,
      configuredMonthlyBudgetEur: 480.32,
      activeMonthlyBudgetEur: 449.92,
      budgetStatus: "ok",
      status: "ok",
    });
    expect(metrics[0].campaignBudgets?.map((campaign) => campaign.effectiveStatus)).toEqual(["ACTIVE", "PAUSED"]);
  });

  it("keeps account-wide Meta budgets but returns N/D KPI rows without an allowlist", async () => {
    process.env.META_AD_ACCOUNT_ID = "123456";
    process.env.META_ACCESS_TOKEN = "meta-secret";
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/campaigns?")) {
        return Response.json({ data: [
          { id: "1", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "1480" },
          { id: "2", status: "PAUSED", effective_status: "PAUSED", daily_budget: "100" },
        ] });
      }
      if (url.includes("/adsets?")) return Response.json({ data: [] });
      expect(url).not.toContain("/insights?");
      return Response.json({ currency: "EUR" });
    });

    const metrics = await collectMetaReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(metrics).toHaveLength(2);
    expect(metrics.every((metric) => metric.status === "not_configured")).toBe(true);
    expect(metrics.every((metric) => metric.spendEur === null && metric.resultCount === null)).toBe(true);
    expect(metrics[0]).toMatchObject({
      configuredMonthlyBudgetEur: 480.32,
      activeMonthlyBudgetEur: 449.92,
      budgetStatus: "ok",
    });
  });

  it("keeps Meta EUR budget fields null for a non-EUR account", () => {
    const [campaign] = parseMetaCampaignBudgets(
      [{ data: [{ id: "1", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "1000" }] }],
      [],
      "USD",
    );
    expect(campaign).toMatchObject({
      currencyCode: "USD",
      dailyBudgetEur: null,
      monthlyEquivalentEur: null,
      activeMonthlyEquivalentEur: null,
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleAdsAppPreflightRequest,
  GOOGLE_ADS_APP_ADMIN_GUARDRAIL,
  GOOGLE_ADS_APP_PREFLIGHT_CONFIG,
  validateGoogleAdsAppCampaignPreflight,
} from "@/lib/marketing/google-ads-app-preflight";

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

function configureOAuth() {
  process.env.GOOGLE_ADS_CUSTOMER_ID = "123-456-7890";
  process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = "987-654-3210";
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "developer-secret";
  process.env.GOOGLE_ADS_CLIENT_ID = "oauth-client";
  process.env.GOOGLE_ADS_CLIENT_SECRET = "oauth-secret";
  process.env.GOOGLE_ADS_REFRESH_TOKEN = "refresh-secret";
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Google Ads Android App campaign preflight", () => {
  it("keeps the entire configuration server-owned, paused and validate-only", () => {
    const payload = buildGoogleAdsAppPreflightRequest("1234567890");
    const serialized = JSON.stringify(payload);

    expect(payload).toMatchObject({
      validateOnly: true,
      partialFailure: false,
      responseContentType: "RESOURCE_NAME_ONLY",
    });
    expect(payload.mutateOperations).toHaveLength(6);
    expect(serialized.match(/"status":"PAUSED"/g)).toHaveLength(3);
    expect(serialized.match(/"status":"ENABLED"/g)).toHaveLength(2);
    expect(serialized).not.toContain("campaignCriteria/");
    expect(serialized).not.toContain("adGroupAds/");
    expect(serialized).not.toContain("selectiveOptimization");
    expect(serialized).not.toContain("sign_up");

    expect(payload.mutateOperations[0]).toMatchObject({
      campaignBudgetOperation: {
        create: {
          resourceName: "customers/1234567890/campaignBudgets/-1",
          amountMicros: "1650000",
          explicitlyShared: false,
        },
      },
    });
    expect(payload.mutateOperations[1]).toMatchObject({
      campaignOperation: {
        create: {
          resourceName: "customers/1234567890/campaigns/-2",
          name: "EL_IT_GADS_APP_INSTALL_ANDROID_20260831_A1",
          status: "PAUSED",
          advertisingChannelType: "MULTI_CHANNEL",
          advertisingChannelSubType: "APP_CAMPAIGN",
          maximizeConversions: {},
          appCampaignSetting: {
            appId: "it.execlingo.app",
            appStore: "GOOGLE_APP_STORE",
            biddingStrategyGoalType: "OPTIMIZE_INSTALLS_WITHOUT_TARGET_INSTALL_COST",
          },
          geoTargetTypeSetting: { positiveGeoTargetType: "PRESENCE" },
        },
      },
    });
    expect(payload.mutateOperations[2]).toMatchObject({
      campaignCriterionOperation: {
        create: {
          status: "ENABLED",
          location: { geoTargetConstant: "geoTargetConstants/2380" },
        },
      },
    });
    expect(payload.mutateOperations[3]).toMatchObject({
      campaignCriterionOperation: {
        create: {
          status: "ENABLED",
          language: { languageConstant: "languageConstants/1004" },
        },
      },
    });
    expect(payload.mutateOperations[4]).toMatchObject({
      adGroupOperation: {
        create: {
          resourceName: "customers/1234567890/adGroups/-3",
          status: "PAUSED",
        },
      },
    });
    expect(payload.mutateOperations[5]).toMatchObject({
      adGroupAdOperation: {
        create: {
          status: "PAUSED",
          ad: { appAd: { headlines: expect.any(Array), descriptions: expect.any(Array) } },
        },
      },
    });
    expect(GOOGLE_ADS_APP_PREFLIGHT_CONFIG).toMatchObject({
      packageName: "it.execlingo.app",
      countryCriterionId: "2380",
      languageCriterionId: "1004",
    });
    expect(GOOGLE_ADS_APP_ADMIN_GUARDRAIL.campaignNote).toContain("solo installazioni Play");
    expect(GOOGLE_ADS_APP_ADMIN_GUARDRAIL.campaignNote).toContain("sign_up nativo richiesto");
    expect(GOOGLE_ADS_APP_ADMIN_GUARDRAIL.budgetLabel).toContain("riallocazione");
  });

  it("sends one atomic v25 validation after the existing OAuth refresh flow", async () => {
    configureOAuth();
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input) === "https://oauth2.googleapis.com/token") {
        expect(String(init?.body)).toContain("refresh_token=refresh-secret");
        return jsonResponse({ access_token: "short-lived-access-token" });
      }

      expect(String(input)).toBe(
        "https://googleads.googleapis.com/v25/customers/1234567890/googleAds:mutate",
      );
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer short-lived-access-token");
      expect(headers["developer-token"]).toBe("developer-secret");
      expect(headers["login-customer-id"]).toBe("9876543210");
      const payload = JSON.parse(String(init?.body)) as { validateOnly?: boolean; mutateOperations?: unknown[] };
      expect(payload.validateOnly).toBe(true);
      expect(payload.mutateOperations).toHaveLength(6);
      return jsonResponse({});
    });

    const result = await validateGoogleAdsAppCampaignPreflight(fetcher);

    expect(result).toMatchObject({ ok: true, status: "valid", operationCount: 6, issues: [] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("uses the existing service-account Google Ads scope when refresh OAuth is absent", async () => {
    process.env.GOOGLE_ADS_CUSTOMER_ID = "1234567890";
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "developer-secret";
    process.env.PLAY_SERVICE_ACCOUNT_EMAIL = "reports@example.iam.gserviceaccount.com";
    process.env.PLAY_SERVICE_ACCOUNT_KEY = "configured-private-key";
    const serviceAccountTokenProvider = vi.fn(async (scope: string) => {
      expect(scope).toBe("https://www.googleapis.com/auth/adwords");
      return "service-account-access-token";
    });
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer service-account-access-token");
      return jsonResponse({});
    });

    const result = await validateGoogleAdsAppCampaignPreflight(fetcher, serviceAccountTokenProvider);

    expect(result.status).toBe("valid");
    expect(serviceAccountTokenProvider).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fails closed before any network call when credentials are incomplete", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const tokenProvider = vi.fn(async () => "must-not-run");

    const result = await validateGoogleAdsAppCampaignPreflight(fetcher, tokenProvider);

    expect(result.status).toBe("not_configured");
    expect(result.operationCount).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
    expect(tokenProvider).not.toHaveBeenCalled();
  });

  it("returns only bounded validation issues and never echoes credentials", async () => {
    configureOAuth();
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (String(input) === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ access_token: "short-lived-access-token" });
      }
      return jsonResponse({
        error: {
          code: 400,
          status: "INVALID_ARGUMENT",
          message: "Request contains an invalid argument.",
          details: [{
            errors: [{
              errorCode: { campaignError: "INVALID_APP_ID" },
              message: "The app ID is not available to Google Ads yet.",
              location: {
                fieldPathElements: [
                  { fieldName: "mutate_operations", index: 1 },
                  { fieldName: "campaign_operation" },
                  { fieldName: "create" },
                  { fieldName: "app_campaign_setting" },
                  { fieldName: "app_id" },
                ],
              },
            }],
          }],
        },
      }, 400);
    });

    const result = await validateGoogleAdsAppCampaignPreflight(fetcher);
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      status: "invalid",
      operationCount: 6,
      issues: [{
        code: "campaignError:INVALID_APP_ID",
        fieldPath: "mutate_operations[1].campaign_operation.create.app_campaign_setting.app_id",
      }],
    });
    expect(serialized).not.toContain("developer-secret");
    expect(serialized).not.toContain("refresh-secret");
    expect(serialized).not.toContain("short-lived-access-token");
  });
});

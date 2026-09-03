import {
  googleAccessToken,
  serviceAccountConfigured,
  SCOPE_GOOGLE_ADS,
} from "@/lib/google-auth";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type ServiceAccountTokenProvider = (scope: string) => Promise<string | null>;

type GoogleAdsMutationConfig = {
  customerId: string;
  loginCustomerId: string | null;
  developerToken: string;
  oauth: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  } | null;
};

export type GoogleAdsAppPreflightIssue = {
  code: string;
  message: string;
  fieldPath: string | null;
};

export type GoogleAdsAppPreflightResult = {
  ok: boolean;
  status: "valid" | "invalid" | "not_configured" | "error";
  detail: string;
  operationCount: number;
  issues: GoogleAdsAppPreflightIssue[];
};

/**
 * This is deliberately code-owned. The ADMIN browser cannot choose another
 * app, account, budget, country, language or creative through request data.
 */
export const GOOGLE_ADS_APP_PREFLIGHT_CONFIG = Object.freeze({
  packageName: "it.execlingo.app",
  appStore: "GOOGLE_APP_STORE",
  campaignName: "EL_IT_GADS_APP_INSTALL_ANDROID_20260831_A1",
  advertisingChannelType: "MULTI_CHANNEL",
  advertisingChannelSubType: "APP_CAMPAIGN",
  countryCriterionId: "2380", // Italy
  languageCriterionId: "1004", // Italian
  dailyBudgetMicros: "1650000", // EUR 1.65/day = EUR 50.16 per Google 30.4-day month
  biddingStrategyGoalType: "OPTIMIZE_INSTALLS_WITHOUT_TARGET_INSTALL_COST",
});

export const GOOGLE_ADS_APP_ADMIN_GUARDRAIL = Object.freeze({
  budgetLabel: "0 € · test install non ancora finanziato; richiede app catalogata, preflight e permessi verdi, poi riallocazione",
  campaignNote: "Test iniziale solo installazioni Play dopo catalogazione, preflight/permessi verdi e riallocazione; sign_up nativo richiesto prima di ottimizzare le registrazioni",
  trackingMeasure: "Download Play automatici; sign_up nativo richiesto per ottimizzare registrazioni",
});

const GOOGLE_ADS_API_VERSION = "v25";
const GOOGLE_ADS_API_ROOT = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OPERATION_COUNT = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedCustomerId(value: string): string | null {
  const normalized = value.replaceAll("-", "").trim();
  return /^\d+$/.test(normalized) ? normalized : null;
}

function readConfig(): { config: GoogleAdsMutationConfig | null; detail: string | null } {
  const raw = {
    customerId: (process.env.GOOGLE_ADS_CUSTOMER_ID ?? "").trim(),
    loginCustomerId: (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "").trim(),
    developerToken: (process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "").trim(),
    clientId: (process.env.GOOGLE_ADS_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? "").trim(),
    clientSecret: (process.env.GOOGLE_ADS_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "").trim(),
    refreshToken: (process.env.GOOGLE_ADS_REFRESH_TOKEN ?? "").trim(),
  };
  const missing = [
    !raw.customerId && "GOOGLE_ADS_CUSTOMER_ID",
    !raw.developerToken && "GOOGLE_ADS_DEVELOPER_TOKEN",
  ].filter(Boolean) as string[];

  if (raw.refreshToken) {
    if (!raw.clientId) missing.push("GOOGLE_ADS_CLIENT_ID o GOOGLE_CLIENT_ID");
    if (!raw.clientSecret) missing.push("GOOGLE_ADS_CLIENT_SECRET o GOOGLE_CLIENT_SECRET");
  } else if (!serviceAccountConfigured()) {
    missing.push("GOOGLE_ADS_REFRESH_TOKEN oppure PLAY_SERVICE_ACCOUNT_EMAIL/PLAY_SERVICE_ACCOUNT_KEY");
  }
  if (missing.length > 0) {
    return { config: null, detail: `Variabili mancanti: ${missing.join(", ")}.` };
  }

  const customerId = normalizedCustomerId(raw.customerId);
  if (!customerId) return { config: null, detail: "GOOGLE_ADS_CUSTOMER_ID non valido." };
  const loginCustomerId = raw.loginCustomerId ? normalizedCustomerId(raw.loginCustomerId) : null;
  if (raw.loginCustomerId && !loginCustomerId) {
    return { config: null, detail: "GOOGLE_ADS_LOGIN_CUSTOMER_ID non valido." };
  }

  return {
    config: {
      customerId,
      loginCustomerId,
      developerToken: raw.developerToken,
      oauth: raw.refreshToken
        ? {
          clientId: raw.clientId,
          clientSecret: raw.clientSecret,
          refreshToken: raw.refreshToken,
        }
        : null,
    },
    detail: null,
  };
}

async function accessToken(
  config: GoogleAdsMutationConfig,
  fetcher: Fetcher,
  serviceAccountTokenProvider: ServiceAccountTokenProvider,
): Promise<{ token: string | null; detail: string | null }> {
  if (!config.oauth) {
    try {
      const token = await serviceAccountTokenProvider(SCOPE_GOOGLE_ADS);
      return token
        ? { token, detail: null }
        : { token: null, detail: "Service account Google Ads: access token non disponibile." };
    } catch {
      return { token: null, detail: "Service account Google Ads non utilizzabile." };
    }
  }

  try {
    const response = await fetcher(GOOGLE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.oauth.clientId,
        client_secret: config.oauth.clientSecret,
        refresh_token: config.oauth.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!response.ok) return { token: null, detail: `OAuth Google Ads: HTTP ${response.status}.` };
    const payload: unknown = await response.json().catch(() => null);
    const token = isRecord(payload) && typeof payload.access_token === "string"
      ? payload.access_token.trim()
      : "";
    return token
      ? { token, detail: null }
      : { token: null, detail: "OAuth Google Ads: access token assente nella risposta." };
  } catch {
    return { token: null, detail: "OAuth Google Ads non raggiungibile." };
  }
}

/**
 * Builds one atomic GoogleAdsService.Mutate request. Negative IDs are
 * temporary resource names and exist only inside this request.
 */
export function buildGoogleAdsAppPreflightRequest(customerId: string) {
  const config = GOOGLE_ADS_APP_PREFLIGHT_CONFIG;
  const budget = `customers/${customerId}/campaignBudgets/-1`;
  const campaign = `customers/${customerId}/campaigns/-2`;
  const adGroup = `customers/${customerId}/adGroups/-3`;

  return {
    mutateOperations: [
      {
        campaignBudgetOperation: {
          create: {
            resourceName: budget,
            name: `${config.campaignName} · Budget`,
            amountMicros: config.dailyBudgetMicros,
            deliveryMethod: "STANDARD",
            explicitlyShared: false,
          },
        },
      },
      {
        campaignOperation: {
          create: {
            resourceName: campaign,
            name: config.campaignName,
            campaignBudget: budget,
            status: "PAUSED",
            advertisingChannelType: config.advertisingChannelType,
            advertisingChannelSubType: config.advertisingChannelSubType,
            maximizeConversions: {},
            appCampaignSetting: {
              appId: config.packageName,
              appStore: config.appStore,
              biddingStrategyGoalType: config.biddingStrategyGoalType,
            },
            geoTargetTypeSetting: { positiveGeoTargetType: "PRESENCE" },
            containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          },
        },
      },
      {
        campaignCriterionOperation: {
          create: {
            campaign,
            status: "ENABLED",
            location: { geoTargetConstant: `geoTargetConstants/${config.countryCriterionId}` },
          },
        },
      },
      {
        campaignCriterionOperation: {
          create: {
            campaign,
            status: "ENABLED",
            language: { languageConstant: `languageConstants/${config.languageCriterionId}` },
          },
        },
      },
      {
        adGroupOperation: {
          create: {
            resourceName: adGroup,
            campaign,
            name: `${config.campaignName} · Gruppo annunci`,
            status: "PAUSED",
          },
        },
      },
      {
        adGroupAdOperation: {
          create: {
            adGroup,
            status: "PAUSED",
            ad: {
              appAd: {
                headlines: [
                  { text: "Inglese per il lavoro" },
                  { text: "Allenati con Sam, coach AI" },
                ],
                descriptions: [
                  { text: "Sessioni pratiche da 2-5 minuti per riunioni, call e trasferte." },
                  { text: "Scarica ExecLingo e prova subito il tuo coach di Business English." },
                ],
              },
            },
          },
        },
      },
    ],
    partialFailure: false,
    validateOnly: true,
    responseContentType: "RESOURCE_NAME_ONLY",
  } as const;
}

function firstErrorCode(value: unknown): string {
  if (!isRecord(value)) return "GOOGLE_ADS_VALIDATION_ERROR";
  for (const [kind, code] of Object.entries(value)) {
    if (typeof code === "string" && code.trim()) return `${kind}:${code.trim()}`;
  }
  return "GOOGLE_ADS_VALIDATION_ERROR";
}

function fieldPath(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.fieldPathElements)) return null;
  const fields = value.fieldPathElements.flatMap((element) => {
    if (!isRecord(element) || typeof element.fieldName !== "string") return [];
    const suffix = typeof element.index === "number" ? `[${element.index}]` : "";
    return [`${element.fieldName}${suffix}`];
  });
  return fields.length > 0 ? fields.join(".") : null;
}

function parseIssues(payload: unknown): GoogleAdsAppPreflightIssue[] {
  if (!isRecord(payload) || !isRecord(payload.error)) return [];
  const issues: GoogleAdsAppPreflightIssue[] = [];
  const details = Array.isArray(payload.error.details) ? payload.error.details : [];
  for (const detail of details) {
    if (!isRecord(detail) || !Array.isArray(detail.errors)) continue;
    for (const error of detail.errors) {
      if (!isRecord(error)) continue;
      issues.push({
        code: firstErrorCode(error.errorCode),
        message: typeof error.message === "string"
          ? error.message.slice(0, 400)
          : "Configurazione Google Ads non valida.",
        fieldPath: fieldPath(error.location),
      });
      if (issues.length === 10) return issues;
    }
  }
  if (issues.length > 0) return issues;

  return [{
    code: typeof payload.error.status === "string" ? payload.error.status : "GOOGLE_ADS_ERROR",
    message: typeof payload.error.message === "string"
      ? payload.error.message.slice(0, 400)
      : "Google Ads ha rifiutato il controllo di configurazione.",
    fieldPath: null,
  }];
}

/**
 * Calls Google Ads with validateOnly=true. A successful response proves that
 * the complete paused campaign graph is accepted, but creates no resource and
 * cannot spend money.
 */
export async function validateGoogleAdsAppCampaignPreflight(
  fetcher: Fetcher = fetch,
  serviceAccountTokenProvider: ServiceAccountTokenProvider = googleAccessToken,
): Promise<GoogleAdsAppPreflightResult> {
  const { config, detail } = readConfig();
  if (!config) {
    return {
      ok: false,
      status: "not_configured",
      detail: detail ?? "Configurazione Google Ads non disponibile.",
      operationCount: 0,
      issues: [],
    };
  }

  const oauth = await accessToken(config, fetcher, serviceAccountTokenProvider);
  if (!oauth.token) {
    return {
      ok: false,
      status: "error",
      detail: oauth.detail ?? "Autorizzazione Google Ads non disponibile.",
      operationCount: 0,
      issues: [],
    };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${oauth.token}`,
    "Content-Type": "application/json",
    "developer-token": config.developerToken,
  };
  if (config.loginCustomerId) headers["login-customer-id"] = config.loginCustomerId;

  try {
    const response = await fetcher(
      `${GOOGLE_ADS_API_ROOT}/customers/${config.customerId}/googleAds:mutate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(buildGoogleAdsAppPreflightRequest(config.customerId)),
      },
    );
    if (response.ok) {
      return {
        ok: true,
        status: "valid",
        detail: "Google Ads ha validato la campagna App completa. Nessuna risorsa è stata creata e nessuna spesa è stata attivata.",
        operationCount: OPERATION_COUNT,
        issues: [],
      };
    }

    const payload: unknown = await response.json().catch(() => null);
    const invalid = response.status === 400;
    return {
      ok: false,
      status: invalid ? "invalid" : "error",
      detail: invalid
        ? "Google Ads ha individuato elementi da correggere. Nessuna risorsa è stata creata."
        : `Google Ads non ha completato il controllo (HTTP ${response.status}). Nessuna risorsa è stata creata.`,
      operationCount: OPERATION_COUNT,
      issues: parseIssues(payload),
    };
  } catch {
    return {
      ok: false,
      status: "error",
      detail: "Google Ads non è raggiungibile. Nessuna risorsa è stata creata.",
      operationCount: OPERATION_COUNT,
      issues: [],
    };
  }
}

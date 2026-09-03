import {
  googleAccessToken,
  serviceAccountConfigured,
  SCOPE_GOOGLE_ADS,
} from "@/lib/google-auth";
import { numericResourceId, readNumericIdAllowlist } from "@/lib/marketing/reporting-allowlist";

export type GoogleAdsReportingPeriod = "today" | "last7";
export type GoogleAdsReportingChannel = "search" | "youtube" | "app";
export type GoogleAdsReportingStatus = "ok" | "not_configured" | "error";
export type GoogleAdsCampaignStatus = "enabled" | "paused" | "mixed" | "unknown" | "not_found";

export type GoogleAdsCampaignBudget = {
  campaignId: string;
  campaignName: string | null;
  channel: GoogleAdsReportingChannel;
  /** Raw Google Ads campaign status (for example ENABLED or PAUSED). */
  status: string | null;
  budgetId: string | null;
  budgetName: string | null;
  /** Raw CampaignBudgetPeriod value returned by Google Ads. */
  budgetPeriod: string | null;
  currencyCode: string | null;
  dailyBudgetEur: number | null;
  lifetimeBudgetEur: number | null;
  /** A daily EUR budget normalised with Google's documented 30.4-day month. */
  monthlyEquivalentEur: number | null;
  activeMonthlyEquivalentEur: number | null;
};

/**
 * One read-only Google Ads KPI row. Monetary values are exposed only when the
 * account reports EUR; an absent API field remains null and is never coerced to
 * zero.
 */
export type GoogleAdsReportingRow = {
  source: "google_ads";
  channel: GoogleAdsReportingChannel;
  period: GoogleAdsReportingPeriod;
  currencyCode: string | null;
  spendEur: number | null;
  registrations: number | null;
  costPerRegistration: number | null;
  campaignStatus: GoogleAdsCampaignStatus;
  campaignBudgets: GoogleAdsCampaignBudget[];
  configuredMonthlyBudgetEur: number | null;
  activeMonthlyBudgetEur: number | null;
  budgetStatus: GoogleAdsReportingStatus;
  budgetDetail: string;
  status: GoogleAdsReportingStatus;
  detail: string;
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type ServiceAccountTokenProvider = (scope: string) => Promise<string | null>;
type PeriodRange = {
  period: GoogleAdsReportingPeriod;
  startDate: string;
  endDate: string;
};
type GoogleAdsConfig = {
  customerId: string;
  loginCustomerId: string | null;
  developerToken: string;
  oauth: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  } | null;
};
type QueryResponse =
  | { ok: true; payload: unknown }
  | { ok: false; detail: string };

type BudgetSnapshot = {
  campaigns: GoogleAdsCampaignBudget[];
  status: GoogleAdsReportingStatus;
  detail: string;
};

type ChannelAccumulator = {
  seenCampaign: boolean;
  statuses: Set<string>;
  currencyCodes: Set<string>;
  hasSpend: boolean;
  spendMicros: bigint;
  hasRegistrations: boolean;
  registrations: number;
};

type GoogleAdsAttributionConfig = {
  campaignIds: Record<GoogleAdsReportingChannel, ReadonlySet<string> | null>;
  registrationActionIds: Record<GoogleAdsReportingChannel, ReadonlySet<string> | null>;
  campaignDetails: Record<GoogleAdsReportingChannel, string | null>;
  registrationDetails: Record<GoogleAdsReportingChannel, string | null>;
};

const GOOGLE_ADS_API_VERSION = "v25";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ADS_API_ROOT = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const REPORT_TIME_ZONE = "Europe/Rome";
const GOOGLE_BUDGET_MONTH_DAYS = 30.4;
const CHANNELS: readonly GoogleAdsReportingChannel[] = ["search", "youtube", "app"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiNumber(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function apiMicros(value: unknown): bigint | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  try {
    return BigInt(value.trim());
  } catch {
    return null;
  }
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calendarDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function moveDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function periodRanges(now: Date): PeriodRange[] {
  const today = calendarDate(now);
  return [
    { period: "today", startDate: today, endDate: today },
    { period: "last7", startDate: moveDate(today, -6), endDate: today },
  ];
}

function blankRow(
  channel: GoogleAdsReportingChannel,
  period: GoogleAdsReportingPeriod,
  status: GoogleAdsReportingStatus,
  detail: string
): GoogleAdsReportingRow {
  return {
    source: "google_ads",
    channel,
    period,
    currencyCode: null,
    spendEur: null,
    registrations: null,
    costPerRegistration: null,
    campaignStatus: "not_found",
    campaignBudgets: [],
    configuredMonthlyBudgetEur: null,
    activeMonthlyBudgetEur: null,
    budgetStatus: status,
    budgetDetail: detail,
    status,
    detail,
  };
}

function blankRows(
  ranges: PeriodRange[],
  status: GoogleAdsReportingStatus,
  detail: string
): GoogleAdsReportingRow[] {
  return ranges.flatMap(({ period }) => CHANNELS.map((channel) => blankRow(channel, period, status, detail)));
}

function normalizedCustomerId(value: string): string | null {
  const normalized = value.replaceAll("-", "").trim();
  return /^\d+$/.test(normalized) ? normalized : null;
}

function readConfig(): { config: GoogleAdsConfig | null; detail: string | null } {
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
    missing.push(
      "GOOGLE_ADS_REFRESH_TOKEN oppure PLAY_SERVICE_ACCOUNT_EMAIL/PLAY_SERVICE_ACCOUNT_KEY"
    );
  }
  if (missing.length > 0) {
    return { config: null, detail: `Variabili mancanti: ${missing.join(", ")}.` };
  }

  const customerId = normalizedCustomerId(raw.customerId);
  if (!customerId) {
    return { config: null, detail: "GOOGLE_ADS_CUSTOMER_ID non valido." };
  }
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
  config: GoogleAdsConfig,
  fetcher: Fetcher,
  serviceAccountTokenProvider: ServiceAccountTokenProvider
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
    if (!response.ok) {
      return { token: null, detail: `OAuth Google Ads: HTTP ${response.status}.` };
    }
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

function performanceQuery(range: PeriodRange): string {
  return `
    SELECT
      campaign.id,
      campaign.advertising_channel_type,
      campaign.status,
      customer.currency_code,
      metrics.cost_micros
    FROM campaign
    WHERE segments.date BETWEEN '${range.startDate}' AND '${range.endDate}'
      AND campaign.advertising_channel_type IN ('SEARCH', 'VIDEO', 'DEMAND_GEN', 'MULTI_CHANNEL')
      AND campaign.status != 'REMOVED'
  `.trim();
}

function registrationQuery(range: PeriodRange): string {
  return `
    SELECT
      campaign.id,
      campaign.advertising_channel_type,
      segments.conversion_action,
      metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${range.startDate}' AND '${range.endDate}'
      AND campaign.advertising_channel_type IN ('SEARCH', 'VIDEO', 'DEMAND_GEN', 'MULTI_CHANNEL')
      AND campaign.status != 'REMOVED'
  `.trim();
}

function campaignBudgetQuery(): string {
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.advertising_channel_type,
      campaign.status,
      customer.currency_code,
      campaign_budget.id,
      campaign_budget.name,
      campaign_budget.period,
      campaign_budget.amount_micros,
      campaign_budget.total_amount_micros
    FROM campaign
    WHERE campaign.advertising_channel_type IN ('SEARCH', 'VIDEO', 'DEMAND_GEN', 'MULTI_CHANNEL')
      AND campaign.status != 'REMOVED'
  `.trim();
}

async function runQuery(
  config: GoogleAdsConfig,
  token: string,
  query: string,
  fetcher: Fetcher
): Promise<QueryResponse> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "developer-token": config.developerToken,
  };
  if (config.loginCustomerId) headers["login-customer-id"] = config.loginCustomerId;

  try {
    const response = await fetcher(
      `${GOOGLE_ADS_API_ROOT}/customers/${config.customerId}/googleAds:searchStream`,
      { method: "POST", headers, body: JSON.stringify({ query }) }
    );
    if (!response.ok) return { ok: false, detail: `Google Ads API: HTTP ${response.status}.` };
    try {
      return { ok: true, payload: await response.json() };
    } catch {
      return { ok: false, detail: "Google Ads API: risposta JSON non valida." };
    }
  } catch {
    return { ok: false, detail: "Google Ads API non raggiungibile." };
  }
}

function streamRows(payload: unknown): Record<string, unknown>[] {
  if (!Array.isArray(payload)) return [];
  const rows: Record<string, unknown>[] = [];
  for (const batch of payload) {
    if (!isRecord(batch) || !Array.isArray(batch.results)) continue;
    for (const row of batch.results) {
      if (isRecord(row)) rows.push(row);
    }
  }
  return rows;
}

function apiIdentifier(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return null;
}

function microsToEur(value: bigint | null, currencyCode: string | null): number | null {
  if (value === null || currencyCode !== "EUR") return null;
  return roundMoney(Number(value) / 1_000_000);
}

/** Parses the configuration query independently from period performance. */
export function parseGoogleAdsCampaignBudgetsPayload(payload: unknown): GoogleAdsCampaignBudget[] {
  const campaigns: GoogleAdsCampaignBudget[] = [];
  for (const row of streamRows(payload)) {
    if (!isRecord(row.campaign)) continue;
    const channel = channelForCampaign(row.campaign);
    const campaignId = apiIdentifier(row.campaign.id);
    if (!channel || !campaignId || row.campaign.status === "REMOVED") continue;

    const budget = isRecord(row.campaignBudget) ? row.campaignBudget : null;
    const currencyCode = isRecord(row.customer) && typeof row.customer.currencyCode === "string"
      ? row.customer.currencyCode.trim().toUpperCase() || null
      : null;
    const budgetPeriod = budget && typeof budget.period === "string" ? budget.period : null;
    const amountMicros = budget ? apiMicros(budget.amountMicros) : null;
    const totalMicros = budget ? apiMicros(budget.totalAmountMicros) : null;
    const positiveTotal = totalMicros !== null && totalMicros > BigInt(0) ? totalMicros : null;
    const dailyMicros = budgetPeriod === "DAILY" && positiveTotal === null ? amountMicros : null;
    const lifetimeMicros = positiveTotal ?? (budgetPeriod === "CUSTOM_PERIOD" ? amountMicros : null);
    const dailyBudgetEur = microsToEur(dailyMicros, currencyCode);
    const lifetimeBudgetEur = microsToEur(lifetimeMicros, currencyCode);
    const monthlyEquivalentEur = dailyBudgetEur === null
      ? null
      : roundMoney(dailyBudgetEur * GOOGLE_BUDGET_MONTH_DAYS);
    const status = typeof row.campaign.status === "string" ? row.campaign.status : null;

    campaigns.push({
      campaignId,
      campaignName: typeof row.campaign.name === "string" ? row.campaign.name : null,
      channel,
      status,
      budgetId: budget ? apiIdentifier(budget.id) : null,
      budgetName: budget && typeof budget.name === "string" ? budget.name : null,
      budgetPeriod,
      currencyCode,
      dailyBudgetEur,
      lifetimeBudgetEur,
      monthlyEquivalentEur,
      activeMonthlyEquivalentEur: status === "ENABLED" ? monthlyEquivalentEur : 0,
    });
  }
  return campaigns;
}

function monthlyBudgetTotal(
  campaigns: GoogleAdsCampaignBudget[],
  activeOnly: boolean,
): number | null {
  const selected = activeOnly
    ? campaigns.filter((campaign) => campaign.status === "ENABLED")
    : campaigns;
  if (selected.length === 0) return 0;
  // Shared CampaignBudget resources appear once per attached campaign in
  // GAQL. Count each budget ID once or the account cap is overstated.
  const unique = new Map<string, number | null>();
  for (const campaign of selected) {
    const key = campaign.budgetId ? `budget:${campaign.budgetId}` : `campaign:${campaign.campaignId}`;
    const value = campaign.monthlyEquivalentEur;
    const previous = unique.get(key);
    if (previous !== undefined && previous !== value) unique.set(key, null);
    else if (!unique.has(key)) unique.set(key, value);
  }
  const values = [...unique.values()];
  if (values.some((value) => value === null)) return null;
  return roundMoney(values.reduce<number>((sum, value) => sum + (value ?? 0), 0));
}

function budgetSnapshot(response: QueryResponse): BudgetSnapshot {
  if (!response.ok) return { campaigns: [], status: "error", detail: response.detail };
  const campaigns = parseGoogleAdsCampaignBudgetsPayload(response.payload);
  return {
    campaigns,
    status: "ok",
    detail: campaigns.length > 0
      ? `Google Ads API: ${campaigns.length} campagne non rimosse con configurazione budget.`
      : "Google Ads API: nessuna campagna Search, Video o App non rimossa.",
  };
}

function channelForCampaign(campaign: Record<string, unknown>): GoogleAdsReportingChannel | null {
  if (campaign.advertisingChannelType === "SEARCH") return "search";
  // Demand Gen can serve on YouTube, Discover and Gmail. ExecLingo's
  // allowlisted B2C video campaign uses this channel type, so it belongs to
  // the existing YouTube/Demand Gen reporting bucket rather than disappearing
  // from the dashboard as an unsupported campaign.
  if (campaign.advertisingChannelType === "VIDEO" || campaign.advertisingChannelType === "DEMAND_GEN") {
    return "youtube";
  }
  if (campaign.advertisingChannelType === "MULTI_CHANNEL") return "app";
  return null;
}

function emptyAccumulator(): ChannelAccumulator {
  return {
    seenCampaign: false,
    statuses: new Set(),
    currencyCodes: new Set(),
    hasSpend: false,
    spendMicros: BigInt(0),
    hasRegistrations: false,
    registrations: 0,
  };
}

function campaignStatus(accumulator: ChannelAccumulator): GoogleAdsCampaignStatus {
  if (!accumulator.seenCampaign) return "not_found";
  const statuses = [...accumulator.statuses];
  if (statuses.length !== 1) return statuses.length > 1 ? "mixed" : "unknown";
  if (statuses[0] === "ENABLED") return "enabled";
  if (statuses[0] === "PAUSED") return "paused";
  return "unknown";
}

function parsePeriod(
  range: PeriodRange,
  performance: QueryResponse,
  registrations: QueryResponse,
  budgets: BudgetSnapshot,
  attribution: GoogleAdsAttributionConfig,
): GoogleAdsReportingRow[] {
  const accumulators: Record<GoogleAdsReportingChannel, ChannelAccumulator> = {
    search: emptyAccumulator(),
    youtube: emptyAccumulator(),
    app: emptyAccumulator(),
  };

  if (budgets.status === "ok") {
    for (const campaign of budgets.campaigns) {
      if (!attribution.campaignIds[campaign.channel]?.has(campaign.campaignId)) continue;
      const accumulator = accumulators[campaign.channel];
      accumulator.seenCampaign = true;
      if (campaign.status) accumulator.statuses.add(campaign.status);
      if (campaign.currencyCode) accumulator.currencyCodes.add(campaign.currencyCode);
    }
  }

  if (performance.ok) {
    for (const row of streamRows(performance.payload)) {
      if (!isRecord(row.campaign)) continue;
      const channel = channelForCampaign(row.campaign);
      if (!channel) continue;
      const campaignId = numericResourceId(row.campaign.id);
      if (!campaignId || !attribution.campaignIds[channel]?.has(campaignId)) continue;
      const accumulator = accumulators[channel];
      accumulator.seenCampaign = true;
      if (typeof row.campaign.status === "string") accumulator.statuses.add(row.campaign.status);

      if (isRecord(row.customer) && typeof row.customer.currencyCode === "string" && row.customer.currencyCode) {
        accumulator.currencyCodes.add(row.customer.currencyCode);
      }
      if (isRecord(row.metrics)) {
        const micros = apiMicros(row.metrics.costMicros);
        if (micros !== null) {
          accumulator.spendMicros += micros;
          accumulator.hasSpend = true;
        }
      }
    }
  }

  if (registrations.ok) {
    for (const row of streamRows(registrations.payload)) {
      if (!isRecord(row.campaign)) continue;
      const channel = channelForCampaign(row.campaign);
      if (!channel || !isRecord(row.metrics)) continue;
      const campaignId = numericResourceId(row.campaign.id);
      const conversionActionId = isRecord(row.segments)
        ? numericResourceId(row.segments.conversionAction)
        : null;
      if (
        !campaignId ||
        !attribution.campaignIds[channel]?.has(campaignId) ||
        !conversionActionId ||
        !attribution.registrationActionIds[channel]?.has(conversionActionId)
      ) continue;
      const conversions = apiNumber(row.metrics.conversions);
      if (conversions !== null) {
        accumulators[channel].registrations += conversions;
        accumulators[channel].hasRegistrations = true;
      }
    }
  }

  return CHANNELS.map((channel) => {
    const accumulator = accumulators[channel];
    const channelBudgets = budgets.campaigns.filter((campaign) => campaign.channel === channel);
    const attributionFailures = [
      attribution.campaignDetails[channel],
      attribution.registrationDetails[channel],
    ].filter(Boolean) as string[];
    if (attributionFailures.length > 0) {
      return {
        source: "google_ads",
        channel,
        period: range.period,
        currencyCode: null,
        spendEur: null,
        registrations: null,
        costPerRegistration: null,
        campaignStatus: "not_found",
        campaignBudgets: channelBudgets,
        configuredMonthlyBudgetEur: budgets.status === "ok"
          ? monthlyBudgetTotal(channelBudgets, false)
          : null,
        activeMonthlyBudgetEur: budgets.status === "ok"
          ? monthlyBudgetTotal(channelBudgets, true)
          : null,
        budgetStatus: budgets.status,
        budgetDetail: budgets.detail,
        status: "not_configured",
        detail: `Attribuzione KPI non configurata. ${attributionFailures.join(" ")}`,
      };
    }
    const currencyCode = accumulator.currencyCodes.size === 1
      ? [...accumulator.currencyCodes][0]
      : null;
    const spendEur = accumulator.hasSpend && currencyCode === "EUR"
      ? roundMoney(Number(accumulator.spendMicros) / 1_000_000)
      : null;
    const registrationCount = accumulator.hasRegistrations ? accumulator.registrations : null;
    const costPerRegistration = spendEur !== null && registrationCount !== null && registrationCount > 0
      ? roundMoney(spendEur / registrationCount)
      : null;

    const failures = [!performance.ok && performance.detail, !registrations.ok && registrations.detail]
      .filter(Boolean) as string[];
    const nonEur = accumulator.hasSpend && currencyCode !== "EUR";
    const status: GoogleAdsReportingStatus = failures.length > 0 || nonEur ? "error" : "ok";
    const label = channel === "search" ? "Search" : channel === "youtube" ? "YouTube Ads" : "Google Ads App";
    const detail = failures.length > 0
      ? failures.join(" ")
      : nonEur
        ? `${label}: valuta account ${currencyCode ?? "N/D"}; spesa EUR non calcolata.`
        : accumulator.seenCampaign
          ? `${label}: dati letti dalla Google Ads API.`
          : `${label}: nessuna campagna nel periodo.`;

    return {
      source: "google_ads",
      channel,
      period: range.period,
      currencyCode,
      spendEur,
      registrations: registrationCount,
      costPerRegistration,
      campaignStatus: campaignStatus(accumulator),
      campaignBudgets: channelBudgets,
      configuredMonthlyBudgetEur: budgets.status === "ok"
        ? monthlyBudgetTotal(channelBudgets, false)
        : null,
      activeMonthlyBudgetEur: budgets.status === "ok"
        ? monthlyBudgetTotal(channelBudgets, true)
        : null,
      budgetStatus: budgets.status,
      budgetDetail: budgets.detail,
      status,
      detail,
    };
  });
}

/**
 * Reads Google Search, Video/YouTube and App (MULTI_CHANNEL) campaign KPIs
 * through the official Google Ads REST API. The adapter never mutates
 * campaigns or budgets.
 */
export async function collectGoogleAdsReporting(
  now: Date = new Date(),
  fetcher: Fetcher = fetch,
  serviceAccountTokenProvider: ServiceAccountTokenProvider = googleAccessToken
): Promise<GoogleAdsReportingRow[]> {
  const ranges = periodRanges(now);
  const { config, detail } = readConfig();
  if (!config) {
    const status: GoogleAdsReportingStatus = detail?.startsWith("Variabili mancanti:")
      ? "not_configured"
      : "error";
    return blankRows(ranges, status, detail ?? "Configurazione Google Ads non valida.");
  }

  const oauth = await accessToken(config, fetcher, serviceAccountTokenProvider);
  if (!oauth.token) {
    return blankRows(ranges, "error", oauth.detail ?? "OAuth Google Ads non disponibile.");
  }

  const rows: GoogleAdsReportingRow[] = [];
  const budgets = budgetSnapshot(await runQuery(config, oauth.token, campaignBudgetQuery(), fetcher));
  const searchCampaigns = readNumericIdAllowlist("GOOGLE_ADS_SEARCH_CAMPAIGN_IDS");
  const youtubeCampaigns = readNumericIdAllowlist("GOOGLE_ADS_YOUTUBE_CAMPAIGN_IDS");
  const appCampaigns = readNumericIdAllowlist("GOOGLE_ADS_APP_CAMPAIGN_IDS");
  const webRegistrationActions = readNumericIdAllowlist("GOOGLE_ADS_REGISTRATION_ACTION_IDS");
  const appRegistrationActions = readNumericIdAllowlist("GOOGLE_ADS_APP_REGISTRATION_ACTION_IDS");
  const attribution: GoogleAdsAttributionConfig = {
    campaignIds: {
      search: searchCampaigns.ids,
      youtube: youtubeCampaigns.ids,
      app: appCampaigns.ids,
    },
    registrationActionIds: {
      search: webRegistrationActions.ids,
      youtube: webRegistrationActions.ids,
      app: appRegistrationActions.ids,
    },
    campaignDetails: {
      search: searchCampaigns.detail,
      youtube: youtubeCampaigns.detail,
      app: appCampaigns.detail,
    },
    registrationDetails: {
      search: webRegistrationActions.detail,
      youtube: webRegistrationActions.detail,
      app: appRegistrationActions.detail,
    },
  };
  const hasConfiguredChannel = CHANNELS.some((channel) =>
    attribution.campaignIds[channel] !== null && attribution.registrationActionIds[channel] !== null
  );
  for (const range of ranges) {
    const [performance, registrations]: [QueryResponse, QueryResponse] = hasConfiguredChannel
      ? await Promise.all([
        runQuery(config, oauth.token, performanceQuery(range), fetcher),
        runQuery(config, oauth.token, registrationQuery(range), fetcher),
      ])
      : [{ ok: true, payload: [] }, { ok: true, payload: [] }];
    rows.push(...parsePeriod(range, performance, registrations, budgets, attribution));
  }
  return rows;
}

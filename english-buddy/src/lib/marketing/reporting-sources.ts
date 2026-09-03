import { googleAccessToken, serviceAccountConfigured } from "@/lib/google-auth";
import { numericResourceId, readNumericIdAllowlist } from "@/lib/marketing/reporting-allowlist";

export type ReportingPeriod = "today" | "last7";
export type ReportingStatus = "ok" | "not_configured" | "error";

export type MetaAdSetBudget = {
  adSetId: string;
  adSetName: string | null;
  status: string | null;
  effectiveStatus: string | null;
  dailyBudgetEur: number | null;
  lifetimeBudgetEur: number | null;
  monthlyEquivalentEur: number | null;
  activeMonthlyEquivalentEur: number | null;
};

export type MetaCampaignBudget = {
  campaignId: string;
  campaignName: string | null;
  status: string | null;
  effectiveStatus: string | null;
  currencyCode: string | null;
  budgetLevel: "campaign" | "ad_set" | "none";
  dailyBudgetEur: number | null;
  lifetimeBudgetEur: number | null;
  monthlyEquivalentEur: number | null;
  activeMonthlyEquivalentEur: number | null;
  adSets: MetaAdSetBudget[];
};

/** A source-neutral row that can be stored or rendered without invented data. */
export type ReportingMetric = {
  source: "ga4" | "meta";
  channel: "web" | "facebook_instagram";
  period: ReportingPeriod;
  spendEur: number | null;
  resultCount: number | null;
  resultLabel: string | null;
  costPerResult: number | null;
  currencyCode: string | null;
  campaignBudgets: MetaCampaignBudget[];
  configuredMonthlyBudgetEur: number | null;
  activeMonthlyBudgetEur: number | null;
  budgetStatus: ReportingStatus;
  budgetDetail: string;
  coverageStart?: string | null;
  coverageEnd?: string | null;
  status: ReportingStatus;
  detail: string;
};

type DateRange = { startDate: string; endDate: string };
type PeriodRange = { period: ReportingPeriod; range: DateRange };
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type ParsedValues = {
  spendEur: number | null;
  resultCount: number | null;
  users: number | null;
};

type MetaBudgetSnapshot = {
  currencyCode: string | null;
  campaigns: MetaCampaignBudget[];
  status: ReportingStatus;
  detail: string;
};

const ANALYTICS_READONLY_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const REPORT_TIME_ZONE = "Europe/Rome";
const DEFAULT_META_API_VERSION = "v25.0";
const META_BUDGET_MONTH_DAYS = 30.4;

const REGISTRATION_ACTIONS = [
  "offsite_conversion.fb_pixel_complete_registration",
  "omni_complete_registration",
  "complete_registration",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiNumber(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Parses the two GA4 metric values requested by this adapter. */
export function parseGa4ReportingPayload(payload: unknown): ParsedValues {
  if (!isRecord(payload) || !Array.isArray(payload.rows)) {
    return { spendEur: null, resultCount: null, users: null };
  }
  const row = payload.rows.find(isRecord);
  if (!row || !Array.isArray(row.metricValues)) {
    return { spendEur: null, resultCount: null, users: null };
  }
  const metricValues = row.metricValues.filter(isRecord);
  return {
    spendEur: null,
    resultCount: apiNumber(metricValues[0]?.value),
    users: apiNumber(metricValues[1]?.value),
  };
}

/**
 * The "web" reporting row must stay isolated from the Android/iOS streams that
 * can share the same GA4 property. Keep the event and platform constraints in
 * one request builder so tests can guard both before a new stream is added.
 */
export function ga4WebSignupReportBody(range: DateRange) {
  return {
    dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
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
  };
}

function registrationValue(actions: unknown): number | null {
  if (!Array.isArray(actions)) return null;
  const values = new Map<string, number>();
  for (const item of actions) {
    if (!isRecord(item) || typeof item.action_type !== "string") continue;
    const value = apiNumber(item.value);
    if (value !== null) values.set(item.action_type, value);
  }
  for (const action of REGISTRATION_ACTIONS) {
    const value = values.get(action);
    if (value !== undefined) return value;
  }
  return null;
}

/** Parses Meta campaign Insights without treating absent fields as zero. */
export function parseMetaInsightsPayload(
  payload: unknown,
  allowedCampaignIds?: ReadonlySet<string>,
): ParsedValues {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return { spendEur: null, resultCount: null, users: null };
  }

  let spend = 0;
  let results = 0;
  let hasSpend = false;
  let hasResults = false;
  for (const rawRow of payload.data) {
    if (!isRecord(rawRow)) continue;
    if (allowedCampaignIds) {
      const campaignId = numericResourceId(rawRow.campaign_id);
      if (!campaignId || !allowedCampaignIds.has(campaignId)) continue;
    }
    const rowSpend = apiNumber(rawRow.spend);
    if (rowSpend !== null) {
      spend += rowSpend;
      hasSpend = true;
    }
    const rowResults = registrationValue(rawRow.actions);
    if (rowResults !== null) {
      results += rowResults;
      hasResults = true;
    }
  }

  return {
    spendEur: hasSpend ? roundMoney(spend) : null,
    resultCount: hasResults ? results : null,
    users: null,
  };
}

function calendarDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
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
    { period: "today", range: { startDate: today, endDate: today } },
    { period: "last7", range: { startDate: moveDate(today, -6), endDate: today } },
  ];
}

function baseMetric(
  source: ReportingMetric["source"],
  channel: ReportingMetric["channel"],
  period: ReportingPeriod,
  status: ReportingStatus,
  detail: string
): ReportingMetric {
  return {
    source,
    channel,
    period,
    spendEur: null,
    resultCount: null,
    resultLabel: "registrazioni",
    costPerResult: null,
    currencyCode: null,
    campaignBudgets: [],
    configuredMonthlyBudgetEur: null,
    activeMonthlyBudgetEur: null,
    budgetStatus: source === "meta" ? status : "not_configured",
    budgetDetail: source === "meta" ? detail : "Non applicabile a questa fonte.",
    status,
    detail,
  };
}

function forEveryPeriod(
  ranges: PeriodRange[],
  source: ReportingMetric["source"],
  channel: ReportingMetric["channel"],
  status: ReportingStatus,
  detail: string
): ReportingMetric[] {
  return ranges.map(({ period }) => baseMetric(source, channel, period, status, detail));
}

function applyValues(metric: ReportingMetric, values: ParsedValues, detail: string): ReportingMetric {
  const costPerResult = values.spendEur !== null && values.resultCount !== null && values.resultCount > 0
    ? roundMoney(values.spendEur / values.resultCount)
    : null;
  return {
    ...metric,
    spendEur: values.spendEur,
    resultCount: values.resultCount,
    costPerResult,
    status: "ok",
    detail,
  };
}

function apiIdentifier(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return null;
}

function metaMinorUnits(value: unknown): number | null {
  const parsed = apiNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function metaMoneyEur(minorUnits: number | null, currencyCode: string | null): number | null {
  return minorUnits === null || currencyCode !== "EUR" ? null : roundMoney(minorUnits / 100);
}

function positive(value: number | null): number | null {
  return value !== null && value > 0 ? value : null;
}

function rowsFromMetaPayloads(payloads: unknown[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const payload of payloads) {
    if (!isRecord(payload) || !Array.isArray(payload.data)) continue;
    for (const row of payload.data) if (isRecord(row)) rows.push(row);
  }
  return rows;
}

function completeSum(values: Array<number | null>): number | null {
  if (values.length === 0 || values.some((value) => value === null)) return null;
  return roundMoney(values.reduce<number>((sum, value) => sum + (value ?? 0), 0));
}

/**
 * Joins campaign- and ad-set-level Meta budgets without double counting. A
 * campaign budget wins when present; otherwise its ad-set budgets are used.
 */
export function parseMetaCampaignBudgets(
  campaignPayloads: unknown[],
  adSetPayloads: unknown[],
  currencyCode: string | null,
): MetaCampaignBudget[] {
  const adSetsByCampaign = new Map<string, MetaAdSetBudget[]>();
  for (const row of rowsFromMetaPayloads(adSetPayloads)) {
    if (row.status === "DELETED" || row.effective_status === "DELETED") continue;
    const campaignId = apiIdentifier(row.campaign_id);
    const adSetId = apiIdentifier(row.id);
    if (!campaignId || !adSetId) continue;
    const dailyBudgetEur = metaMoneyEur(positive(metaMinorUnits(row.daily_budget)), currencyCode);
    const lifetimeBudgetEur = metaMoneyEur(positive(metaMinorUnits(row.lifetime_budget)), currencyCode);
    const monthlyEquivalentEur = dailyBudgetEur !== null && lifetimeBudgetEur === null
      ? roundMoney(dailyBudgetEur * META_BUDGET_MONTH_DAYS)
      : null;
    const effectiveStatus = typeof row.effective_status === "string" ? row.effective_status : null;
    const adSet: MetaAdSetBudget = {
      adSetId,
      adSetName: typeof row.name === "string" ? row.name : null,
      status: typeof row.status === "string" ? row.status : null,
      effectiveStatus,
      dailyBudgetEur,
      lifetimeBudgetEur,
      monthlyEquivalentEur,
      activeMonthlyEquivalentEur: effectiveStatus === "ACTIVE" ? monthlyEquivalentEur : 0,
    };
    adSetsByCampaign.set(campaignId, [...(adSetsByCampaign.get(campaignId) ?? []), adSet]);
  }

  const campaigns: MetaCampaignBudget[] = [];
  for (const row of rowsFromMetaPayloads(campaignPayloads)) {
    if (row.status === "DELETED" || row.effective_status === "DELETED") continue;
    const campaignId = apiIdentifier(row.id);
    if (!campaignId) continue;
    const adSets = adSetsByCampaign.get(campaignId) ?? [];
    const campaignDaily = positive(metaMinorUnits(row.daily_budget));
    const campaignLifetime = positive(metaMinorUnits(row.lifetime_budget));
    const hasCampaignBudget = campaignDaily !== null || campaignLifetime !== null;
    const budgetLevel: MetaCampaignBudget["budgetLevel"] = hasCampaignBudget
      ? "campaign"
      : adSets.length > 0 ? "ad_set" : "none";

    let dailyBudgetEur: number | null;
    let lifetimeBudgetEur: number | null;
    let monthlyEquivalentEur: number | null;
    let activeMonthlyEquivalentEur: number | null;
    const effectiveStatus = typeof row.effective_status === "string" ? row.effective_status : null;
    if (budgetLevel === "campaign") {
      dailyBudgetEur = metaMoneyEur(campaignDaily, currencyCode);
      lifetimeBudgetEur = metaMoneyEur(campaignLifetime, currencyCode);
      monthlyEquivalentEur = dailyBudgetEur !== null && lifetimeBudgetEur === null
        ? roundMoney(dailyBudgetEur * META_BUDGET_MONTH_DAYS)
        : null;
      activeMonthlyEquivalentEur = effectiveStatus === "ACTIVE" ? monthlyEquivalentEur : 0;
    } else if (budgetLevel === "ad_set") {
      dailyBudgetEur = completeSum(adSets.map((adSet) => adSet.dailyBudgetEur));
      const lifetimeValues = adSets
        .map((adSet) => adSet.lifetimeBudgetEur)
        .filter((value): value is number => value !== null);
      lifetimeBudgetEur = lifetimeValues.length > 0
        ? roundMoney(lifetimeValues.reduce((sum, value) => sum + value, 0))
        : null;
      monthlyEquivalentEur = completeSum(adSets.map((adSet) => adSet.monthlyEquivalentEur));
      activeMonthlyEquivalentEur = effectiveStatus === "ACTIVE"
        ? completeSum(adSets
          .filter((adSet) => adSet.effectiveStatus === "ACTIVE")
          .map((adSet) => adSet.activeMonthlyEquivalentEur)) ?? (
            adSets.every((adSet) => adSet.effectiveStatus !== "ACTIVE") ? 0 : null
          )
        : 0;
    } else {
      dailyBudgetEur = null;
      lifetimeBudgetEur = null;
      monthlyEquivalentEur = null;
      activeMonthlyEquivalentEur = effectiveStatus === "ACTIVE" ? null : 0;
    }

    campaigns.push({
      campaignId,
      campaignName: typeof row.name === "string" ? row.name : null,
      status: typeof row.status === "string" ? row.status : null,
      effectiveStatus,
      currencyCode,
      budgetLevel,
      dailyBudgetEur,
      lifetimeBudgetEur,
      monthlyEquivalentEur,
      activeMonthlyEquivalentEur,
      adSets,
    });
  }
  return campaigns;
}

type MetaPageResult = { ok: true; payloads: unknown[] } | { ok: false; detail: string; payloads: unknown[] };

async function fetchMetaPages(url: string, accessToken: string, fetcher: Fetcher): Promise<MetaPageResult> {
  const payloads: unknown[] = [];
  let nextUrl: string | null = url;
  for (let page = 0; nextUrl && page < 20; page += 1) {
    try {
      const response = await fetcher(nextUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) return { ok: false, detail: `Meta Marketing API: HTTP ${response.status}.`, payloads };
      const payload: unknown = await response.json().catch(() => null);
      payloads.push(payload);
      const next = isRecord(payload) && isRecord(payload.paging) && typeof payload.paging.next === "string"
        ? payload.paging.next
        : null;
      if (next) {
        const parsed = new URL(next);
        if (parsed.protocol !== "https:" || parsed.hostname !== "graph.facebook.com") {
          return { ok: false, detail: "Meta Marketing API: URL di paginazione non valida.", payloads };
        }
      }
      nextUrl = next;
    } catch {
      return { ok: false, detail: "Meta Marketing API non raggiungibile.", payloads };
    }
  }
  if (nextUrl) return { ok: false, detail: "Meta Marketing API: paginazione oltre il limite di sicurezza.", payloads };
  return { ok: true, payloads };
}

async function fetchMetaBudgetSnapshot(
  account: string,
  accessToken: string,
  apiVersion: string,
  fetcher: Fetcher,
): Promise<MetaBudgetSnapshot> {
  const root = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(account)}`;
  const campaignsParams = new URLSearchParams({
    fields: "id,name,status,effective_status,daily_budget,lifetime_budget",
    limit: "500",
  });
  const adSetsParams = new URLSearchParams({
    fields: "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget",
    limit: "500",
  });
  const [accountResult, campaignsResult, adSetsResult] = await Promise.all([
    fetchMetaPages(`${root}?fields=currency`, accessToken, fetcher),
    fetchMetaPages(`${root}/campaigns?${campaignsParams}`, accessToken, fetcher),
    fetchMetaPages(`${root}/adsets?${adSetsParams}`, accessToken, fetcher),
  ]);
  const accountPayload = accountResult.payloads[0];
  const rawCurrency = isRecord(accountPayload) && typeof accountPayload.currency === "string"
    ? accountPayload.currency.trim().toUpperCase()
    : "";
  const currencyCode = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : null;
  const campaigns = parseMetaCampaignBudgets(campaignsResult.payloads, adSetsResult.payloads, currencyCode);
  const failures = [
    !accountResult.ok && accountResult.detail,
    !campaignsResult.ok && campaignsResult.detail,
    !adSetsResult.ok && adSetsResult.detail,
    !currencyCode && "Meta Marketing API: valuta account assente.",
  ].filter(Boolean) as string[];
  const currencyDetail = currencyCode === "EUR"
    ? "Valuta account EUR."
    : `Valuta account ${currencyCode ?? "N/D"}: importi EUR non calcolati.`;
  return {
    currencyCode,
    campaigns,
    status: failures.length > 0 ? "error" : "ok",
    detail: failures.length > 0
      ? failures.join(" ")
      : `Meta Marketing API: ${campaigns.length} campagne non eliminate. ${currencyDetail}`,
  };
}

function metaMonthlyTotal(
  campaigns: MetaCampaignBudget[],
  field: "monthlyEquivalentEur" | "activeMonthlyEquivalentEur",
): number | null {
  if (campaigns.length === 0) return 0;
  const values = campaigns.map((campaign) => campaign[field]);
  if (values.some((value) => value === null)) return null;
  return roundMoney(values.reduce<number>((sum, value) => sum + (value ?? 0), 0));
}

function metaBudgetFields(budgets: MetaBudgetSnapshot): Pick<
  ReportingMetric,
  "currencyCode" | "campaignBudgets" | "configuredMonthlyBudgetEur" |
  "activeMonthlyBudgetEur" | "budgetStatus" | "budgetDetail"
> {
  return {
    currencyCode: budgets.currencyCode,
    campaignBudgets: budgets.campaigns,
    configuredMonthlyBudgetEur: budgets.status === "ok"
      ? metaMonthlyTotal(budgets.campaigns, "monthlyEquivalentEur")
      : null,
    activeMonthlyBudgetEur: budgets.status === "ok"
      ? metaMonthlyTotal(budgets.campaigns, "activeMonthlyEquivalentEur")
      : null,
    budgetStatus: budgets.status,
    budgetDetail: budgets.detail,
  };
}

async function fetchGa4Metric(
  propertyId: string,
  token: string,
  periodRange: PeriodRange,
  fetcher: Fetcher
): Promise<ReportingMetric> {
  const metric = baseMetric("ga4", "web", periodRange.period, "error", "GA4 Data API non disponibile.");
  try {
    const response = await fetcher(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(ga4WebSignupReportBody(periodRange.range)),
    });
    if (!response.ok) return { ...metric, detail: `GA4 Data API: HTTP ${response.status}.` };
    const payload: unknown = await response.json().catch(() => null);
    const values = parseGa4ReportingPayload(payload);
    const detail = values.resultCount === null
      ? "GA4 Data API: nessuna riga sign_up nel periodo."
      : `GA4 Data API: evento sign_up; utenti unici ${values.users ?? "N/D"}.`;
    return applyValues(metric, values, detail);
  } catch {
    return metric;
  }
}

async function collectGa4(ranges: PeriodRange[], fetcher: Fetcher): Promise<ReportingMetric[]> {
  const propertyId = (process.env.GA4_PROPERTY_ID ?? "").trim();
  const missing = [
    !propertyId && "GA4_PROPERTY_ID",
    !(process.env.PLAY_SERVICE_ACCOUNT_EMAIL ?? "").trim() && "PLAY_SERVICE_ACCOUNT_EMAIL",
    !(process.env.PLAY_SERVICE_ACCOUNT_KEY ?? "").trim() && "PLAY_SERVICE_ACCOUNT_KEY",
  ].filter(Boolean) as string[];
  if (missing.length > 0 || !serviceAccountConfigured()) {
    return forEveryPeriod(ranges, "ga4", "web", "not_configured", `Variabili mancanti: ${missing.join(", ")}.`);
  }
  if (!/^\d+$/.test(propertyId)) {
    return forEveryPeriod(ranges, "ga4", "web", "error", "GA4_PROPERTY_ID deve essere l'ID numerico della proprietà.");
  }

  const token = await googleAccessToken(ANALYTICS_READONLY_SCOPE).catch(() => null);
  if (!token) {
    return forEveryPeriod(ranges, "ga4", "web", "error", "Impossibile ottenere il token Google per GA4.");
  }
  return Promise.all(ranges.map((range) => fetchGa4Metric(propertyId, token, range, fetcher)));
}

async function fetchMetaMetric(
  adAccountId: string,
  accessToken: string,
  apiVersion: string,
  periodRange: PeriodRange,
  fetcher: Fetcher,
  budgets: MetaBudgetSnapshot,
  allowedCampaignIds: ReadonlySet<string>,
): Promise<ReportingMetric> {
  const metric = baseMetric("meta", "facebook_instagram", periodRange.period, "error", "Meta Insights non disponibile.");
  const account = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const params = new URLSearchParams({
    fields: "campaign_id,spend,actions",
    level: "campaign",
    time_range: JSON.stringify({ since: periodRange.range.startDate, until: periodRange.range.endDate }),
    limit: "500",
  });

  try {
    const result = await fetchMetaPages(
      `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(account)}/insights?${params}`,
      accessToken,
      fetcher,
    );
    if (!result.ok) return {
      ...metric,
      ...metaBudgetFields(budgets),
      detail: result.detail,
    };
    const values = parseMetaInsightsPayload(
      { data: rowsFromMetaPayloads(result.payloads) },
      allowedCampaignIds,
    );
    const currencyValues = {
      ...values,
      spendEur: budgets.currencyCode === "EUR" ? values.spendEur : null,
    };
    const activityDetail = values.resultCount === null
      ? "Meta Insights: azione CompleteRegistration assente nelle campagne autorizzate."
      : "Meta Insights: azione CompleteRegistration nelle campagne autorizzate.";
    const currencyDetail = budgets.currencyCode === "EUR"
      ? "Valuta account EUR."
      : `Valuta account ${budgets.currencyCode ?? "N/D"}: spesa EUR non calcolata.`;
    return {
      ...applyValues(metric, currencyValues, `${activityDetail} ${currencyDetail}`),
      ...metaBudgetFields(budgets),
    };
  } catch {
    return {
      ...metric,
      ...metaBudgetFields(budgets),
    };
  }
}

async function collectMeta(ranges: PeriodRange[], fetcher: Fetcher): Promise<ReportingMetric[]> {
  const adAccountId = (process.env.META_AD_ACCOUNT_ID ?? "").trim();
  const accessToken = (process.env.META_ACCESS_TOKEN ?? "").trim();
  const missing = [!adAccountId && "META_AD_ACCOUNT_ID", !accessToken && "META_ACCESS_TOKEN"].filter(Boolean) as string[];
  if (missing.length > 0) {
    return forEveryPeriod(ranges, "meta", "facebook_instagram", "not_configured", `Variabili mancanti: ${missing.join(", ")}.`);
  }

  const apiVersion = (process.env.META_GRAPH_API_VERSION ?? DEFAULT_META_API_VERSION).trim();
  if (!/^v\d+\.\d+$/.test(apiVersion)) {
    return forEveryPeriod(ranges, "meta", "facebook_instagram", "error", "META_GRAPH_API_VERSION non valida.");
  }
  const account = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const budgets = await fetchMetaBudgetSnapshot(account, accessToken, apiVersion, fetcher);
  const campaignAllowlist = readNumericIdAllowlist("META_CAMPAIGN_IDS");
  if (!campaignAllowlist.ids) {
    return ranges.map(({ period }) => ({
      ...baseMetric(
        "meta",
        "facebook_instagram",
        period,
        "not_configured",
        `Attribuzione KPI non configurata. ${campaignAllowlist.detail ?? "META_CAMPAIGN_IDS non valida."}`,
      ),
      ...metaBudgetFields(budgets),
    }));
  }
  const allowedCampaignIds = campaignAllowlist.ids;
  return Promise.all(ranges.map((range) => fetchMetaMetric(
    adAccountId, accessToken, apiVersion, range, fetcher, budgets, allowedCampaignIds,
  )));
}

export function collectGa4Reporting(now: Date = new Date(), fetcher: Fetcher = fetch): Promise<ReportingMetric[]> {
  return collectGa4(periodRanges(now), fetcher);
}

export function collectMetaReporting(now: Date = new Date(), fetcher: Fetcher = fetch): Promise<ReportingMetric[]> {
  return collectMeta(periodRanges(now), fetcher);
}

/** Collects only configured external sources; missing credentials never become zero-valued KPIs. */
export async function collectExternalReporting(
  now: Date = new Date(),
  fetcher: Fetcher = fetch,
): Promise<ReportingMetric[]> {
  const [ga4, meta] = await Promise.all([collectGa4Reporting(now, fetcher), collectMetaReporting(now, fetcher)]);
  return [...ga4, ...meta];
}

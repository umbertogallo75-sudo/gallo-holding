import { createPrivateKey, createSign } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { googleAccessToken, serviceAccountConfigured } from "@/lib/google-auth";
import { readNumericIdAllowlist } from "@/lib/marketing/reporting-allowlist";

/**
 * Read-only reporting adapters for sources that do not share the GA4/Meta
 * response shape. Missing data is deliberately nullable: an absent provider
 * report is not evidence of zero activity.
 */

export type OtherReportingPeriod = "today" | "last7";
export type OtherReportingStatus = "ok" | "not_configured" | "error";
export type OtherReportingSource = "linkedin" | "app_store" | "google_play";

export type LinkedInCampaignBudget = {
  campaignId: string;
  campaignName: string | null;
  /** Raw LinkedIn campaign status, including DRAFT/PAUSED/ARCHIVED when returned. */
  status: string | null;
  servingStatuses: string[];
  currencyCode: string | null;
  dailyBudgetEur: number | null;
  lifetimeBudgetEur: number | null;
  monthlyEquivalentEur: number | null;
  activeMonthlyEquivalentEur: number | null;
};

export type OtherReportingMetric = {
  source: OtherReportingSource;
  channel: "linkedin" | "ios" | "android";
  period: OtherReportingPeriod;
  /** Provider spend in the account currency. */
  spendAmount: number | null;
  /** ISO-4217 currency when the provider exposes or configures it. */
  currency: string | null;
  /** Populated only when the account currency is EUR; never FX-estimated. */
  spendEur: number | null;
  resultCount: number | null;
  resultLabel: "lead aziendali" | "download";
  /** Same currency as spendAmount. */
  costPerResult: number | null;
  /** Exact provider coverage when a lagged seven-day window is returned. */
  coverageStart: string | null;
  coverageEnd: string | null;
  campaignBudgets: LinkedInCampaignBudget[];
  configuredMonthlyBudgetEur: number | null;
  activeMonthlyBudgetEur: number | null;
  budgetStatus: OtherReportingStatus;
  budgetDetail: string;
  status: OtherReportingStatus;
  detail: string;
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type GoogleTokenProvider = (scope: string) => Promise<string | null>;
type PeriodRange = {
  period: OtherReportingPeriod;
  startDate: string;
  endDate: string;
  dates: string[];
};

export type OtherReportingOptions = {
  fetcher?: Fetcher;
  googleTokenProvider?: GoogleTokenProvider;
};

const REPORT_TIME_ZONE = "Europe/Rome";
const DEFAULT_LINKEDIN_API_VERSION = "202608";
const GOOGLE_STORAGE_READONLY_SCOPE = "https://www.googleapis.com/auth/devstorage.read_only";
const DEFAULT_PLAY_PACKAGE = "it.execlingo.app";
const APP_DOWNLOAD_PRODUCT_TYPES = new Set(["1", "1E", "1EP", "1EU", "1F", "1T"]);
const LINKEDIN_BUDGET_MONTH_DAYS = 30.4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function moveDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function inclusiveDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  for (let date = startDate; date <= endDate; date = moveDate(date, 1)) dates.push(date);
  return dates;
}

function periodRanges(now: Date): PeriodRange[] {
  const today = calendarDate(now);
  const last7Start = moveDate(today, -6);
  return [
    { period: "today", startDate: today, endDate: today, dates: [today] },
    { period: "last7", startDate: last7Start, endDate: today, dates: inclusiveDates(last7Start, today) },
  ];
}

function baseMetric(
  source: OtherReportingSource,
  channel: OtherReportingMetric["channel"],
  period: OtherReportingPeriod,
  resultLabel: OtherReportingMetric["resultLabel"],
  status: OtherReportingStatus,
  detail: string,
): OtherReportingMetric {
  return {
    source,
    channel,
    period,
    spendAmount: null,
    currency: null,
    spendEur: null,
    resultCount: null,
    resultLabel,
    costPerResult: null,
    coverageStart: null,
    coverageEnd: null,
    campaignBudgets: [],
    configuredMonthlyBudgetEur: null,
    activeMonthlyBudgetEur: null,
    budgetStatus: source === "linkedin" ? status : "not_configured",
    budgetDetail: source === "linkedin" ? detail : "Non applicabile a questa fonte.",
    status,
    detail,
  };
}

function missingMetrics(
  ranges: PeriodRange[],
  source: OtherReportingSource,
  channel: OtherReportingMetric["channel"],
  resultLabel: OtherReportingMetric["resultLabel"],
  missing: string[],
): OtherReportingMetric[] {
  const detail = `Variabili mancanti: ${missing.join(", ")}.`;
  return ranges.map(({ period }) => baseMetric(source, channel, period, resultLabel, "not_configured", detail));
}

function linkedinDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `(year:${year},month:${month},day:${day})`;
}

export type LinkedInReportingValues = {
  spendAmount: number | null;
  leads: number | null;
};

/** Parses account-level LinkedIn Ads analytics without coercing omitted fields to zero. */
export function parseLinkedInAnalyticsPayload(payload: unknown): LinkedInReportingValues {
  if (!isRecord(payload) || !Array.isArray(payload.elements) || payload.elements.length === 0) {
    return { spendAmount: null, leads: null };
  }
  let spend = 0;
  let leads = 0;
  let hasSpend = false;
  let hasLeads = false;
  for (const raw of payload.elements) {
    if (!isRecord(raw)) continue;
    const rowSpend = apiNumber(raw.costInLocalCurrency);
    const rowLeads = apiNumber(raw.oneClickLeads);
    if (rowSpend !== null) {
      spend += rowSpend;
      hasSpend = true;
    }
    if (rowLeads !== null) {
      leads += rowLeads;
      hasLeads = true;
    }
  }
  return {
    spendAmount: hasSpend ? roundMoney(spend) : null,
    leads: hasLeads ? leads : null,
  };
}

function apiIdentifier(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return null;
}

function linkedInMoney(value: unknown): { amount: number | null; currencyCode: string | null } {
  if (!isRecord(value)) return { amount: null, currencyCode: null };
  const amount = apiNumber(value.amount);
  const rawCurrency = typeof value.currencyCode === "string" ? value.currencyCode.trim().toUpperCase() : "";
  return {
    amount: amount !== null && amount >= 0 ? amount : null,
    currencyCode: /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : null,
  };
}

function positiveAmount(value: number | null): number | null {
  return value !== null && value > 0 ? value : null;
}

/** Parses every non-removed LinkedIn campaign returned by the account finder. */
export function parseLinkedInCampaignBudgets(payloads: unknown[]): LinkedInCampaignBudget[] {
  const campaigns: LinkedInCampaignBudget[] = [];
  for (const payload of payloads) {
    if (!isRecord(payload) || !Array.isArray(payload.elements)) continue;
    for (const row of payload.elements) {
      if (!isRecord(row) || row.status === "REMOVED") continue;
      const campaignId = apiIdentifier(row.id);
      if (!campaignId) continue;
      const daily = linkedInMoney(row.dailyBudget);
      const total = linkedInMoney(row.totalBudget);
      const dailyAmount = positiveAmount(daily.amount);
      const lifetimeAmount = positiveAmount(total.amount);
      const currencies = [daily.currencyCode, total.currencyCode].filter((value): value is string => Boolean(value));
      const currencyCode = currencies.length > 0 && new Set(currencies).size === 1 ? currencies[0] : null;
      const dailyBudgetEur = dailyAmount !== null && daily.currencyCode === "EUR" ? roundMoney(dailyAmount) : null;
      const lifetimeBudgetEur = lifetimeAmount !== null && total.currencyCode === "EUR" ? roundMoney(lifetimeAmount) : null;
      // A total/lifetime cap cannot be converted into a monthly commitment
      // without inventing a flight duration, even when a daily cap coexists.
      const monthlyEquivalentEur = dailyBudgetEur !== null && lifetimeAmount === null
        ? roundMoney(dailyBudgetEur * LINKEDIN_BUDGET_MONTH_DAYS)
        : null;
      const status = typeof row.status === "string" ? row.status : null;
      campaigns.push({
        campaignId,
        campaignName: typeof row.name === "string" ? row.name : null,
        status,
        servingStatuses: Array.isArray(row.servingStatuses)
          ? row.servingStatuses.filter((value): value is string => typeof value === "string")
          : [],
        currencyCode,
        dailyBudgetEur,
        lifetimeBudgetEur,
        monthlyEquivalentEur,
        activeMonthlyEquivalentEur: status === "ACTIVE" ? monthlyEquivalentEur : 0,
      });
    }
  }
  return campaigns;
}

type LinkedInBudgetSnapshot = {
  campaigns: LinkedInCampaignBudget[];
  status: OtherReportingStatus;
  detail: string;
};

function linkedInMonthlyTotal(
  campaigns: LinkedInCampaignBudget[],
  field: "monthlyEquivalentEur" | "activeMonthlyEquivalentEur",
): number | null {
  if (campaigns.length === 0) return 0;
  const values = campaigns.map((campaign) => campaign[field]);
  if (values.some((value) => value === null)) return null;
  return roundMoney(values.reduce<number>((sum, value) => sum + (value ?? 0), 0));
}

function linkedInBudgetFields(budgets: LinkedInBudgetSnapshot): Pick<
  OtherReportingMetric,
  "campaignBudgets" | "configuredMonthlyBudgetEur" | "activeMonthlyBudgetEur" |
  "budgetStatus" | "budgetDetail"
> {
  return {
    campaignBudgets: budgets.campaigns,
    configuredMonthlyBudgetEur: budgets.status === "ok"
      ? linkedInMonthlyTotal(budgets.campaigns, "monthlyEquivalentEur")
      : null,
    activeMonthlyBudgetEur: budgets.status === "ok"
      ? linkedInMonthlyTotal(budgets.campaigns, "activeMonthlyEquivalentEur")
      : null,
    budgetStatus: budgets.status,
    budgetDetail: budgets.detail,
  };
}

async function fetchLinkedInCampaignBudgets(
  accountId: string,
  accessToken: string,
  apiVersion: string,
  fetcher: Fetcher,
): Promise<LinkedInBudgetSnapshot> {
  const payloads: unknown[] = [];
  let pageToken: string | null = null;
  const search = "(status:(values:List(ACTIVE,PAUSED,ARCHIVED,COMPLETED,CANCELED,DRAFT,PENDING_DELETION)))";
  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({ q: "search", search, pageSize: "1000" });
    if (pageToken) params.set("pageToken", pageToken);
    const url = `https://api.linkedin.com/rest/adAccounts/${encodeURIComponent(accountId)}/adCampaigns?${params}`;
    try {
      const response = await fetcher(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Linkedin-Version": apiVersion,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      });
      if (!response.ok) {
        return {
          campaigns: parseLinkedInCampaignBudgets(payloads),
          status: "error",
          detail: `LinkedIn Campaign API: HTTP ${response.status}.`,
        };
      }
      const payload: unknown = await response.json().catch(() => null);
      payloads.push(payload);
      const metadata = isRecord(payload) && isRecord(payload.metadata) ? payload.metadata : null;
      const nextPageToken = metadata && typeof metadata.nextPageToken === "string"
        ? metadata.nextPageToken.trim()
        : "";
      if (!nextPageToken) {
        pageToken = null;
        break;
      }
      pageToken = nextPageToken;
    } catch {
      return {
        campaigns: parseLinkedInCampaignBudgets(payloads),
        status: "error",
        detail: "LinkedIn Campaign API non raggiungibile.",
      };
    }
  }
  if (pageToken) {
    return {
      campaigns: parseLinkedInCampaignBudgets(payloads),
      status: "error",
      detail: "LinkedIn Campaign API: paginazione oltre il limite di sicurezza.",
    };
  }
  const campaigns = parseLinkedInCampaignBudgets(payloads);
  return {
    campaigns,
    status: "ok",
    detail: campaigns.length > 0
      ? `LinkedIn Campaign API: ${campaigns.length} campagne non rimosse con configurazione budget.`
      : "LinkedIn Campaign API: nessuna campagna non rimossa.",
  };
}

function linkedInUrl(campaignIds: ReadonlySet<string>, range: PeriodRange): string {
  const campaignUrns = [...campaignIds]
    .map((campaignId) => encodeURIComponent(`urn:li:sponsoredCampaign:${campaignId}`))
    .join(",");
  const dateRange = `(start:${linkedinDate(range.startDate)},end:${linkedinDate(range.endDate)})`;
  return "https://api.linkedin.com/rest/adAnalytics"
    + `?q=analytics&pivot=CAMPAIGN&timeGranularity=ALL&dateRange=${dateRange}`
    + `&campaigns=List(${campaignUrns})&fields=costInLocalCurrency,oneClickLeads,dateRange,pivotValues`;
}

async function fetchLinkedInMetric(
  campaignIds: ReadonlySet<string>,
  accessToken: string,
  apiVersion: string,
  accountCurrency: string | null,
  range: PeriodRange,
  fetcher: Fetcher,
  budgets: LinkedInBudgetSnapshot,
): Promise<OtherReportingMetric> {
  const fallback = baseMetric(
    "linkedin",
    "linkedin",
    range.period,
    "lead aziendali",
    "error",
    "LinkedIn Ads Reporting non disponibile.",
  );
  try {
    const response = await fetcher(linkedInUrl(campaignIds, range), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Linkedin-Version": apiVersion,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });
    if (!response.ok) return {
      ...fallback,
      ...linkedInBudgetFields(budgets),
      detail: `LinkedIn Ads Reporting: HTTP ${response.status}.`,
    };
    const values = parseLinkedInAnalyticsPayload(await response.json().catch(() => null));
    const spendAmount = accountCurrency ? values.spendAmount : null;
    const costPerResult = spendAmount !== null && values.leads !== null && values.leads > 0
      ? roundMoney(spendAmount / values.leads)
      : null;
    const currencyDetail = accountCurrency
      ? `Valuta account ${accountCurrency}.`
      : "LINKEDIN_ACCOUNT_CURRENCY assente: spesa non esposta per evitare una valuta presunta.";
    const activityDetail = values.spendAmount === null && values.leads === null
      ? "Risposta senza attività misurabile; il provider non distingue sempre assenza di attività e accesso dati insufficiente."
      : "Metriche costInLocalCurrency e oneClickLeads lette per le campagne B2B autorizzate.";
    return {
      ...fallback,
      spendAmount,
      currency: accountCurrency,
      spendEur: accountCurrency === "EUR" ? spendAmount : null,
      resultCount: values.leads,
      costPerResult,
      coverageStart: range.startDate,
      coverageEnd: range.endDate,
      ...linkedInBudgetFields(budgets),
      status: "ok",
      detail: `${activityDetail} ${currencyDetail}`,
    };
  } catch {
    return {
      ...fallback,
      ...linkedInBudgetFields(budgets),
    };
  }
}

/** LinkedIn Ads spend and Lead Gen count through the read-only reporting API. */
export async function collectLinkedInReporting(
  now: Date = new Date(),
  fetcher: Fetcher = fetch,
): Promise<OtherReportingMetric[]> {
  const ranges = periodRanges(now);
  const accountId = (process.env.LINKEDIN_AD_ACCOUNT_ID ?? "").trim().replace(/^urn:li:sponsoredAccount:/, "");
  const accessToken = (process.env.LINKEDIN_ACCESS_TOKEN ?? "").trim();
  const missing = [!accountId && "LINKEDIN_AD_ACCOUNT_ID", !accessToken && "LINKEDIN_ACCESS_TOKEN"].filter(Boolean) as string[];
  if (missing.length > 0) return missingMetrics(ranges, "linkedin", "linkedin", "lead aziendali", missing);

  const apiVersion = (process.env.LINKEDIN_API_VERSION ?? DEFAULT_LINKEDIN_API_VERSION).trim();
  if (!/^\d{6}$/.test(apiVersion)) {
    return ranges.map(({ period }) => baseMetric(
      "linkedin", "linkedin", period, "lead aziendali", "error", "LINKEDIN_API_VERSION non valida (formato YYYYMM).",
    ));
  }
  const rawCurrency = (process.env.LINKEDIN_ACCOUNT_CURRENCY ?? "").trim().toUpperCase();
  const accountCurrency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : null;
  const budgets = await fetchLinkedInCampaignBudgets(accountId, accessToken, apiVersion, fetcher);
  const campaignAllowlist = readNumericIdAllowlist("LINKEDIN_B2B_CAMPAIGN_IDS");
  if (!campaignAllowlist.ids) {
    return ranges.map(({ period }) => ({
      ...baseMetric(
        "linkedin",
        "linkedin",
        period,
        "lead aziendali",
        "not_configured",
        `Attribuzione KPI non configurata. ${campaignAllowlist.detail ?? "LINKEDIN_B2B_CAMPAIGN_IDS non valida."}`,
      ),
      ...linkedInBudgetFields(budgets),
    }));
  }
  const allowedCampaignIds = campaignAllowlist.ids;
  return Promise.all(ranges.map((range) => fetchLinkedInMetric(
    allowedCampaignIds, accessToken, apiVersion, accountCurrency, range, fetcher, budgets,
  )));
}

function b64url(value: Buffer): string {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type AppStoreReportingConfig = {
  issuerId: string;
  keyId: string;
  privateKey: string;
  vendorNumber: string;
  appleId: string;
  sku: string;
};

function appStoreReportingConfig(): AppStoreReportingConfig {
  return {
    issuerId: (process.env.APPSTORE_REPORTING_ISSUER_ID ?? "").trim(),
    keyId: (process.env.APPSTORE_REPORTING_KEY_ID ?? "").trim(),
    privateKey: (process.env.APPSTORE_REPORTING_PRIVATE_KEY ?? "").trim(),
    vendorNumber: (process.env.APPSTORE_REPORTING_VENDOR_NUMBER ?? "").trim(),
    appleId: (process.env.APPSTORE_REPORTING_APP_APPLE_ID ?? "").trim(),
    sku: (process.env.APPSTORE_REPORTING_APP_SKU ?? "").trim(),
  };
}

/** Builds the short-lived ES256 team-key JWT required by App Store Connect. */
export function createAppStoreConnectToken(now: Date = new Date()): string | null {
  const config = appStoreReportingConfig();
  const { issuerId, keyId } = config;
  const privateKey = config.privateKey.replace(/\\n/g, "\n");
  if (!issuerId || !keyId || !privateKey) return null;
  try {
    const header = { alg: "ES256", kid: keyId, typ: "JWT" };
    const issuedAt = Math.floor(now.getTime() / 1000) - 30;
    const payload = {
      iss: issuerId,
      iat: issuedAt,
      exp: issuedAt + 15 * 60,
      aud: "appstoreconnect-v1",
    };
    const signingInput = `${b64url(Buffer.from(JSON.stringify(header)))}.${b64url(Buffer.from(JSON.stringify(payload)))}`;
    const signer = createSign("SHA256");
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign({
      key: createPrivateKey(privateKey),
      dsaEncoding: "ieee-p1363",
    });
    return `${signingInput}.${b64url(signature)}`;
  } catch {
    return null;
  }
}

type AppStoreDailyResult = {
  date: string;
  downloads: number | null;
  status: "ok" | "selector_missing" | "unavailable" | "error";
  httpStatus: number | null;
  detail: string | null;
};

function decodeGzipOrText(buffer: ArrayBuffer): string {
  const bytes = Buffer.from(buffer);
  const decoded = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  return decoded.toString("utf8").replace(/^\uFEFF/, "");
}

function splitTabRows(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split("\t").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

type ParsedAppStoreSalesReport = {
  downloads: number;
  matchedSelector: boolean;
};

function parseAppStoreSalesReportDetailed(
  text: string,
  selector: { appleId?: string; sku?: string },
): ParsedAppStoreSalesReport | null {
  const rows = splitTabRows(text);
  if (rows.length === 0) return null;
  let downloads = 0;
  let matchedApp = false;
  for (const row of rows) {
    const matches = selector.appleId
      ? row["Apple Identifier"] === selector.appleId
      : row.SKU === selector.sku;
    if (!matches) continue;
    matchedApp = true;
    if (!APP_DOWNLOAD_PRODUCT_TYPES.has(row["Product Type Identifier"])) continue;
    const units = apiNumber(row.Units);
    if (units === null) return null;
    downloads += units;
  }
  return { downloads: Math.max(0, downloads), matchedSelector: matchedApp };
}

/** Parses a Summary Sales report and counts only initial app downloads. */
export function parseAppStoreSalesReport(
  text: string,
  selector: { appleId?: string; sku?: string },
): number | null {
  const parsed = parseAppStoreSalesReportDetailed(text, selector);
  return parsed?.matchedSelector ? parsed.downloads : null;
}

function appStoreSalesUrl(vendorNumber: string, date: string): string {
  const params = new URLSearchParams({
    "filter[frequency]": "DAILY",
    "filter[reportDate]": date,
    "filter[reportSubType]": "SUMMARY",
    "filter[reportType]": "SALES",
    "filter[vendorNumber]": vendorNumber,
    "filter[version]": "1_0",
  });
  return `https://api.appstoreconnect.apple.com/v1/salesReports?${params}`;
}

function appStoreHttpError(status: number): string {
  if (status === 401) return "App Store Connect: autenticazione rifiutata (HTTP 401); verificare Team API key, issuer e key ID.";
  if (status === 403) return "App Store Connect: autorizzazione rifiutata (HTTP 403); la Team API key deve avere il ruolo Sales and Reports.";
  if (status === 429) return "App Store Connect: limite richieste raggiunto (HTTP 429); riprovare alla prossima raccolta.";
  if (status >= 500) return `App Store Connect temporaneamente non disponibile (HTTP ${status}).`;
  return `App Store Connect: richiesta Sales Reports rifiutata (HTTP ${status}).`;
}

async function fetchAppStoreDay(
  date: string,
  token: string,
  vendorNumber: string,
  selector: { appleId?: string; sku?: string },
  fetcher: Fetcher,
): Promise<AppStoreDailyResult> {
  try {
    const response = await fetcher(appStoreSalesUrl(vendorNumber, date), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/a-gzip" },
    });
    if (!response.ok) {
      return {
        date,
        downloads: null,
        status: response.status === 404 ? "unavailable" : "error",
        httpStatus: response.status,
        detail: response.status === 404 ? null : appStoreHttpError(response.status),
      };
    }
    const parsed = parseAppStoreSalesReportDetailed(decodeGzipOrText(await response.arrayBuffer()), selector);
    if (!parsed) {
      return {
        date,
        downloads: null,
        status: "error",
        httpStatus: response.status,
        detail: "App Store Connect: Summary Sales report non interpretabile.",
      };
    }
    return {
      date,
      downloads: parsed.downloads,
      status: parsed.matchedSelector ? "ok" : "selector_missing",
      httpStatus: response.status,
      detail: null,
    };
  } catch {
    return {
      date,
      downloads: null,
      status: "error",
      httpStatus: null,
      detail: "App Store Connect: richiesta Sales Reports non riuscita senza risposta HTTP.",
    };
  }
}

function latestCompleteDates(
  candidatesNewestFirst: string[],
  available: (date: string) => boolean,
): string[] | null {
  for (const end of candidatesNewestFirst) {
    const dates = inclusiveDates(moveDate(end, -6), end);
    if (dates.every(available)) return dates;
  }
  return null;
}

function delayedTodayMetric(source: "app_store" | "google_play", channel: "ios" | "android", detail: string): OtherReportingMetric {
  return baseMetric(source, channel, "today", "download", "ok", detail);
}

function appStoreCompleteWindowMetric(
  dates: string[] | null,
  daily: Map<string, AppStoreDailyResult>,
  diagnostic: string | null = null,
): OtherReportingMetric {
  const diagnosticSuffix = diagnostic ? ` ${diagnostic}` : "";
  const fallback = baseMetric(
    "app_store",
    "ios",
    "last7",
    "download",
    "ok",
    `App Store: non risultano ancora sette giornate contigue pubblicate; valore N/D.${diagnosticSuffix}`,
  );
  if (!dates) return fallback;
  return {
    ...fallback,
    resultCount: dates.reduce((sum, date) => sum + (daily.get(date)?.downloads ?? 0), 0),
    coverageStart: dates[0],
    coverageEnd: dates[dates.length - 1],
    detail: `Sette giorni completi fino al ${dates[dates.length - 1]}; download iniziali, aggiornamenti e re-download esclusi.${diagnosticSuffix}`,
  };
}

function appStoreErrorMetrics(ranges: PeriodRange[], detail: string): OtherReportingMetric[] {
  return ranges.map(({ period }) => baseMetric("app_store", "ios", period, "download", "error", detail));
}

/** App Store Connect Sales and Trends, using a read-only team key. */
export async function collectAppStoreReporting(
  now: Date = new Date(),
  fetcher: Fetcher = fetch,
): Promise<OtherReportingMetric[]> {
  const ranges = periodRanges(now);
  const { issuerId, keyId, privateKey, vendorNumber, appleId, sku } = appStoreReportingConfig();
  const missing = [
    !issuerId && "APPSTORE_REPORTING_ISSUER_ID",
    !keyId && "APPSTORE_REPORTING_KEY_ID",
    !privateKey && "APPSTORE_REPORTING_PRIVATE_KEY",
    !vendorNumber && "APPSTORE_REPORTING_VENDOR_NUMBER",
    !appleId && !sku && "APPSTORE_REPORTING_APP_APPLE_ID oppure APPSTORE_REPORTING_APP_SKU",
  ].filter(Boolean) as string[];
  if (missing.length > 0) return missingMetrics(ranges, "app_store", "ios", "download", missing);

  const token = createAppStoreConnectToken(now);
  if (!token) {
    return ranges.map(({ period }) => baseMetric(
      "app_store", "ios", period, "download", "error", "Impossibile firmare il JWT App Store Connect.",
    ));
  }
  const today = calendarDate(now);
  // Ask for eight closed days: if yesterday's report is still delayed, the
  // preceding seven can still form one honest complete window.
  const dates = inclusiveDates(moveDate(today, -8), moveDate(today, -1));
  const selector = appleId ? { appleId } : { sku };
  const results = await Promise.all(dates.map((date) => fetchAppStoreDay(
    date, token, vendorNumber, selector, fetcher,
  )));
  const hardError = results.find((result) => result.status === "error" && (
    result.httpStatus === 401
    || result.httpStatus === 403
    || (result.httpStatus !== null && result.httpStatus !== 429 && result.httpStatus < 500)
  ));
  if (hardError) {
    return appStoreErrorMetrics(ranges, hardError.detail ?? "App Store Connect: errore durante la raccolta Sales Reports.");
  }
  const selectorMatched = results.some((result) => result.status === "ok");
  if (!selectorMatched && results.some((result) => result.status === "selector_missing")) {
    const selectorLabel = appleId ? "Apple ID" : "SKU";
    return appStoreErrorMetrics(
      ranges,
      `App Store Connect: ${selectorLabel} configurato non presente nei Summary Sales report disponibili.`,
    );
  }
  if (!selectorMatched && results.every((result) => result.status === "unavailable")) {
    return appStoreErrorMetrics(
      ranges,
      "App Store Connect: nessun Summary Sales report disponibile ha validato vendor e Apple ID/SKU; impossibile distinguere giorni a zero download da una configurazione errata.",
    );
  }
  const daily = new Map(results.map((result) => [result.date, result]));
  const candidates = [...dates].reverse();
  const latestRequestedDate = dates[dates.length - 1];
  const completeDates = latestCompleteDates(candidates, (date) => {
    const status = daily.get(date)?.status;
    return status === "ok" || (selectorMatched && (
      status === "selector_missing"
      || (status === "unavailable" && date !== latestRequestedDate)
    ));
  });
  const transientErrors = results.filter((result) => result.status === "error");
  if (!completeDates && transientErrors.length > 0) {
    const detail = transientErrors
      .map((result) => `${result.date}: ${result.detail ?? "errore durante la raccolta Sales Reports."}`)
      .join(" ");
    return appStoreErrorMetrics(ranges, detail);
  }
  const diagnostics = transientErrors.length > 0
    ? [`Raccolta parziale: ${transientErrors.map((result) => `${result.date}: ${result.detail}`).join(" ")} È stata usata la finestra completa precedente.`]
    : [];
  const zeroDownloadDates = completeDates?.filter((date) => daily.get(date)?.status === "unavailable") ?? [];
  if (zeroDownloadDates.length > 0) {
    diagnostics.push(
      `I report HTTP 404 del ${zeroDownloadDates.join(", ")} sono conteggiati come zero download dopo la validazione di vendor e selettore.`,
    );
  }
  const diagnostic = diagnostics.length > 0 ? diagnostics.join(" ") : null;
  return [
    delayedTodayMetric("app_store", "ios", "Il report App Store del giorno corrente non è ancora pubblicato; valore oggi N/D."),
    appStoreCompleteWindowMetric(completeDates, daily, diagnostic),
  ];
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    if (row.some((value) => value !== "")) rows.push(row);
  }
  return rows;
}

function decodeGoogleCsv(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes).replace(/^\uFEFF/, "");
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes).replace(/^\uFEFF/, "");
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

/** Returns Daily User Installs by date from the country breakdown export. */
export function parseGooglePlayInstallsReport(text: string, packageName: string): Map<string, number> | null {
  const parsed = parseCsv(text);
  if (parsed.length < 1) return null;
  const headers = parsed[0].map((header) => header.trim().replace(/^\uFEFF/, ""));
  const dateIndex = headers.indexOf("Date");
  const packageIndex = headers.indexOf("Package Name");
  const installsIndex = headers.indexOf("Daily User Installs");
  if (dateIndex < 0 || packageIndex < 0 || installsIndex < 0) return null;

  const result = new Map<string, number>();
  for (const row of parsed.slice(1)) {
    if (row[packageIndex] !== packageName) continue;
    const date = row[dateIndex];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const installs = apiNumber(row[installsIndex]?.replace(/,/g, ""));
    if (installs === null || installs < 0) return null;
    result.set(date, (result.get(date) ?? 0) + installs);
  }
  return result;
}

function playObjectName(packageName: string, month: string): string {
  return `stats/installs/installs_${packageName}_${month}_country.csv`;
}

type PlayMonthResult = {
  month: string;
  installs: Map<string, number> | null;
  status: "ok" | "unavailable" | "transient_error" | "error";
  detail: string | null;
};

function playHttpError(month: string, status: number): string {
  const reason = status === 401
    ? "credenziali non accettate"
    : status === 403
      ? "service account senza accesso al bucket"
      : "risposta non riuscita";
  return `Google Play GCS: HTTP ${status} (${reason}) per il report ${month}.`;
}

function playUnavailableDetail(month: string): string {
  return `Google Play GCS: report mensile ${month} non ancora disponibile (HTTP 404); app e accesso report verificati, normale ritardo di pubblicazione di 3–7 giorni.`;
}

async function fetchPlayMonth(
  bucket: string,
  packageName: string,
  month: string,
  accessToken: string,
  fetcher: Fetcher,
): Promise<PlayMonthResult> {
  const object = encodeURIComponent(playObjectName(packageName, month));
  const url = `https://storage.googleapis.com/download/storage/v1/b/${encodeURIComponent(bucket)}/o/${object}?alt=media`;
  try {
    const response = await fetcher(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
      if (response.status === 404) {
        return { month, installs: null, status: "unavailable", detail: playUnavailableDetail(month) };
      }
      const status = response.status === 429 || response.status >= 500 ? "transient_error" : "error";
      return { month, installs: null, status, detail: playHttpError(month, response.status) };
    }
    const installs = parseGooglePlayInstallsReport(decodeGoogleCsv(await response.arrayBuffer()), packageName);
    if (!installs) {
      return {
        month,
        installs: null,
        status: "error",
        detail: `Google Play GCS: CSV non valido per il report ${month}; intestazioni o valori attesi mancanti.`,
      };
    }
    return { month, installs, status: "ok", detail: null };
  } catch {
    return {
      month,
      installs: null,
      status: "transient_error",
      detail: `Google Play GCS: errore di rete o lettura per il report ${month}.`,
    };
  }
}

function playCompleteWindowMetric(
  dates: string[] | null,
  daily: Map<string, number>,
  diagnostic: string | null = null,
): OtherReportingMetric {
  const diagnosticSuffix = diagnostic ? ` ${diagnostic}` : "";
  const fallback = baseMetric(
    "google_play",
    "android",
    "last7",
    "download",
    "ok",
    `Google Play: non risultano ancora sette giornate contigue nel report GCS; valore N/D.${diagnosticSuffix}`,
  );
  if (!dates) return fallback;
  return {
    ...fallback,
    resultCount: dates.reduce((sum, date) => sum + (daily.get(date) ?? 0), 0),
    coverageStart: dates[0],
    coverageEnd: dates[dates.length - 1],
    detail: `Sette giorni completi fino al ${dates[dates.length - 1]}; Daily User Installs dal report GCS.${diagnosticSuffix}`,
  };
}

/** Google Play install reports from the account's private Cloud Storage bucket. */
export async function collectGooglePlayReporting(
  now: Date = new Date(),
  fetcher: Fetcher = fetch,
  tokenProvider: GoogleTokenProvider = googleAccessToken,
): Promise<OtherReportingMetric[]> {
  const ranges = periodRanges(now);
  const bucket = (process.env.GOOGLE_PLAY_REPORT_BUCKET ?? "").trim().replace(/^gs:\/\//, "").replace(/\/$/, "");
  const packageName = (process.env.GOOGLE_PLAY_PACKAGE_NAME ?? DEFAULT_PLAY_PACKAGE).trim();
  const missing = [
    !bucket && "GOOGLE_PLAY_REPORT_BUCKET",
    !packageName && "GOOGLE_PLAY_PACKAGE_NAME",
    !(process.env.PLAY_SERVICE_ACCOUNT_EMAIL ?? "").trim() && "PLAY_SERVICE_ACCOUNT_EMAIL",
    !(process.env.PLAY_SERVICE_ACCOUNT_KEY ?? "").trim() && "PLAY_SERVICE_ACCOUNT_KEY",
  ].filter(Boolean) as string[];
  if (missing.length > 0 || !serviceAccountConfigured()) {
    return missingMetrics(ranges, "google_play", "android", "download", missing);
  }

  const accessToken = await tokenProvider(GOOGLE_STORAGE_READONLY_SCOPE).catch(() => null);
  if (!accessToken) {
    return ranges.map(({ period }) => baseMetric(
      "google_play", "android", period, "download", "error", "Token Google Cloud Storage non disponibile.",
    ));
  }
  const today = calendarDate(now);
  // Play acquisition exports commonly lag several days. Read a 21-day search
  // horizon, then choose the newest seven contiguous dates actually present.
  const candidateDates = inclusiveDates(moveDate(today, -21), today);
  const months = [...new Set(candidateDates.map((date) => date.slice(0, 7).replace("-", "")))];
  const reports = await Promise.all(months.map((month) => fetchPlayMonth(
    bucket, packageName, month, accessToken, fetcher,
  )));
  const hardFailures = reports.flatMap((report) => report.status === "error" && report.detail ? [report.detail] : []);
  if (hardFailures.length > 0) {
    const detail = hardFailures.join(" ");
    return ranges.map(({ period }) => baseMetric(
      "google_play", "android", period, "download", "error", detail,
    ));
  }
  const daily = new Map<string, number>();
  for (const report of reports) {
    if (!report.installs) continue;
    for (const [date, installs] of report.installs) daily.set(date, installs);
  }
  const candidates = candidateDates.filter((date) => daily.has(date)).reverse();
  const completeDates = latestCompleteDates(candidates, (date) => daily.has(date));
  const unavailable = reports.flatMap((report) => report.status === "unavailable" && report.detail ? [report.detail] : []);
  const transientFailures = reports.flatMap((report) => (
    report.status === "transient_error" && report.detail ? [report.detail] : []
  ));
  if (!completeDates && transientFailures.length > 0) {
    const detail = transientFailures.join(" ");
    return ranges.map(({ period }) => baseMetric(
      "google_play", "android", period, "download", "error", detail,
    ));
  }
  const diagnostics = [...unavailable, ...transientFailures];
  const diagnostic = diagnostics.length > 0 ? diagnostics.join(" ") : null;
  return [
    delayedTodayMetric("google_play", "android", "Il report Google Play del giorno corrente può arrivare con 3–7 giorni di ritardo; valore oggi N/D."),
    playCompleteWindowMetric(completeDates, daily, diagnostic),
  ];
}

/** Collects all additional read-only sources; each provider fails independently. */
export async function collectOtherReporting(
  now: Date = new Date(),
  options: OtherReportingOptions = {},
): Promise<OtherReportingMetric[]> {
  const fetcher = options.fetcher ?? fetch;
  const tokenProvider = options.googleTokenProvider ?? googleAccessToken;
  const [linkedin, appStore, googlePlay] = await Promise.all([
    collectLinkedInReporting(now, fetcher),
    collectAppStoreReporting(now, fetcher),
    collectGooglePlayReporting(now, fetcher, tokenProvider),
  ]);
  return [...linkedin, ...appStore, ...googlePlay];
}

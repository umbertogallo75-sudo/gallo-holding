import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import {
  completeMarketingRun,
  failMarketingRun,
  markMarketingEmail,
  readMarketingSnapshot,
  upsertMarketingKpis,
  upsertMarketingTrackingHealth,
  type MarketingKpi,
  type MarketingKpiInput,
  type MarketingSnapshot,
  type MarketingTrackingHealth,
  type MarketingTrackingInput,
} from "@/lib/marketing/collector-store";
import {
  collectGa4Reporting,
  collectMetaReporting,
  type ReportingMetric,
  type ReportingPeriod,
} from "@/lib/marketing/reporting-sources";
import {
  collectGoogleAdsReporting,
  type GoogleAdsReportingRow,
} from "@/lib/marketing/google-ads-reporting";
import {
  collectAppStoreReporting,
  collectGooglePlayReporting,
  collectLinkedInReporting,
  type OtherReportingMetric,
} from "@/lib/marketing/other-reporting";
import {
  collectYouTubeReporting,
  type YouTubeReportingMetric,
} from "@/lib/marketing/youtube-reporting";

export const MARKETING_TIME_ZONE = "Europe/Rome";
export const MARKETING_REPORT_RECIPIENT = "umberto.gallo75@gmail.com";
export const MONTHLY_BUDGET_CAP_EUR = 1_500;
export const MARKETING_SNAPSHOT_STALE_AFTER_HOURS = 24;
const MARKETING_SNAPSHOT_STALE_AFTER_MS = MARKETING_SNAPSHOT_STALE_AFTER_HOURS * 60 * 60_000;

/**
 * These are the live authorised caps after YouTube was activated. Daily
 * Google budgets use Google's 30.4-day monthly equivalent, hence the cents.
 */
export const MARKETING_BUDGET_PLAN = [
  { source: "google_ads_search", label: "Google Ads Search", monthlyEur: 597.97, resultLabel: "registrazioni" },
  { source: "meta", label: "Facebook + Instagram", monthlyEur: 450, resultLabel: "registrazioni" },
  { source: "linkedin", label: "LinkedIn Lead Gen", monthlyEur: 300, resultLabel: "lead aziendali" },
  { source: "google_ads_youtube", label: "YouTube Ads", monthlyEur: 152, resultLabel: "registrazioni" },
  // No incremental spend is authorised: a future App campaign must replace
  // budget already present in this plan before it can be enabled.
  { source: "google_ads_app", label: "Google Ads App", monthlyEur: 0, resultLabel: "registrazioni" },
] as const;

export const MARKETING_BUDGET_TOTAL_EUR = Number(
  MARKETING_BUDGET_PLAN.reduce((sum, item) => sum + item.monthlyEur, 0).toFixed(2),
);

export type MarketingSlot = {
  runKey: string;
  localDate: string;
  localHour: 8 | 17;
  scheduledFor: Date;
};

export type MarketingReportChannel = {
  source: string;
  label: string;
  spendTodayEur: number | null;
  spend7dEur: number | null;
  resultsToday: number | null;
  results7d: number | null;
  resultLabel: string;
  costPerResult7dEur: number | null;
  campaignStatus: string | null;
  dataThrough: string | null;
  configuredMonthlyBudgetEur: number | null;
  activeMonthlyBudgetEur: number | null;
  budgetStatus: "available" | "unavailable" | "error" | null;
  budgetDetail: string | null;
  status: "available" | "partial" | "stale" | "unavailable";
  detail: string;
};

export type MarketingReport = {
  generatedAt: string;
  title: string;
  semaphore: "Verde" | "Giallo" | "Rosso";
  summary: string[];
  channels: MarketingReportChannel[];
  tracking: MarketingTrackingHealth[];
  budget: typeof MARKETING_BUDGET_PLAN;
  budgetTotalEur: number;
  budgetCapEur: number;
  actualActiveBudgetEur: number | null;
  actualConfiguredBudgetEur: number | null;
  budgetVerification: "verified" | "stale" | "unavailable" | "over_cap";
  snapshotFreshness: "fresh" | "stale";
  staleAfterHours: number;
  modifications: string[];
  priorities: string[];
  nextAction: string;
};

const PERIODS: ReportingPeriod[] = ["today", "last7"];
const PROVIDER_TIMEOUT_MS = 10_000;

async function withProviderTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), PROVIDER_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function reportingFailure(
  source: ReportingMetric["source"],
  channel: ReportingMetric["channel"],
  detail: string,
): ReportingMetric[] {
  return PERIODS.map((period) => ({
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
    budgetStatus: "error",
    budgetDetail: detail,
    status: "error",
    detail,
  }));
}

function googleAdsFailure(detail: string): GoogleAdsReportingRow[] {
  return PERIODS.flatMap((period) => (["search", "youtube", "app"] as const).map((channel) => ({
    source: "google_ads" as const,
    channel,
    period,
    currencyCode: null,
    spendEur: null,
    registrations: null,
    costPerRegistration: null,
    campaignStatus: "unknown" as const,
    campaignBudgets: [],
    configuredMonthlyBudgetEur: null,
    activeMonthlyBudgetEur: null,
    budgetStatus: "error" as const,
    budgetDetail: detail,
    status: "error" as const,
    detail,
  })));
}

function otherFailure(
  source: OtherReportingMetric["source"],
  channel: OtherReportingMetric["channel"],
  resultLabel: OtherReportingMetric["resultLabel"],
  detail: string,
): OtherReportingMetric[] {
  return PERIODS.map((period) => ({
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
    budgetStatus: "error",
    budgetDetail: detail,
    status: "error",
    detail,
  }));
}

function youtubeFailure(detail: string): YouTubeReportingMetric[] {
  return PERIODS.map((period) => ({
    source: "youtube_organic",
    channel: "youtube",
    period,
    views: null,
    annotationClicks: null,
    cardClicks: null,
    status: "error",
    detail,
  }));
}

function localParts(now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MARKETING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, hour: Number(value("hour")) };
}

/** Returns a slot only during the two authorised Europe/Rome report hours. */
export function scheduledMarketingSlot(now: Date = new Date()): MarketingSlot | null {
  const local = localParts(now);
  if (local.hour !== 8 && local.hour !== 17) return null;
  return {
    runKey: `marketing-sync:${local.date}:${String(local.hour).padStart(2, "0")}`,
    localDate: local.date,
    localHour: local.hour,
    scheduledFor: now,
  };
}

/** Creates a five-minute idempotency bucket for an authenticated manual run. */
export function manualMarketingSlot(now: Date = new Date()): MarketingSlot {
  const local = localParts(now);
  const hour = local.hour < 13 ? 8 : 17;
  const bucket = new Date(now);
  bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / 5) * 5, 0, 0);
  const minuteKey = bucket.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return {
    runKey: `marketing-sync:manual:${minuteKey}`,
    localDate: local.date,
    localHour: hour,
    scheduledFor: now,
  };
}

function moveDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Convert a Rome wall-clock instant to UTC without assuming a fixed offset. */
function zonedStartOfDay(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const desired = Date.UTC(year, month - 1, day);
  let guess = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: MARKETING_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const represented = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
    const delta = desired - represented;
    guess += delta;
    if (delta === 0) break;
  }
  return new Date(guess);
}

function micros(eur: number | null): number | null {
  return eur === null ? null : Math.round(eur * 1_000_000);
}

function campaignSummary(campaigns: unknown[]): string | null {
  const counts = new Map<string, number>();
  for (const raw of campaigns) {
    if (typeof raw !== "object" || raw === null) continue;
    const row = raw as Record<string, unknown>;
    const status = typeof row.effectiveStatus === "string"
      ? row.effectiveStatus
      : typeof row.status === "string" ? row.status : "unknown";
    counts.set(status.toLowerCase(), (counts.get(status.toLowerCase()) ?? 0) + 1);
  }
  return counts.size ? [...counts].map(([status, count]) => `${status}: ${count}`).join(" · ") : null;
}

function dataStatus(metric: ReportingMetric): MarketingKpiInput["dataStatus"] {
  if (metric.status !== "ok") return "unavailable";
  if (metric.source === "meta") {
    return metric.resultCount !== null && metric.spendEur !== null ? "available" : "partial";
  }
  return metric.resultCount !== null ? "available" : "partial";
}

function metricToKpi(metric: ReportingMetric, day: string): MarketingKpiInput {
  return {
    day,
    source: metric.source,
    window: metric.period,
    campaignStatus: metric.source === "meta" ? campaignSummary(metric.campaignBudgets) : null,
    spendMicros: micros(metric.spendEur),
    registrations: metric.resultLabel === "registrazioni" ? metric.resultCount : null,
    leads: metric.resultLabel === "lead aziendali" ? metric.resultCount : null,
    costPerRegistrationMicros: metric.resultLabel === "registrazioni" ? micros(metric.costPerResult) : null,
    costPerLeadMicros: metric.resultLabel === "lead aziendali" ? micros(metric.costPerResult) : null,
    configuredMonthlyBudgetMicros: metric.source === "meta" ? micros(metric.configuredMonthlyBudgetEur) : null,
    activeMonthlyBudgetMicros: metric.source === "meta" ? micros(metric.activeMonthlyBudgetEur) : null,
    budgetStatus: metric.source === "meta" ? metric.budgetStatus === "ok" ? "available" : metric.budgetStatus === "error" ? "error" : "unavailable" : null,
    budgetDetail: metric.source === "meta" ? metric.budgetDetail : null,
    campaignBudgets: metric.source === "meta" ? metric.campaignBudgets : [],
    dataStatus: dataStatus(metric),
  };
}

function googleAdsToKpi(metric: GoogleAdsReportingRow, day: string): MarketingKpiInput {
  const source = metric.channel === "search"
    ? "google_ads_search"
    : metric.channel === "youtube" ? "google_ads_youtube" : "google_ads_app";
  return {
    day,
    source,
    window: metric.period,
    campaignStatus: metric.campaignStatus,
    currency: metric.currencyCode ?? "EUR",
    spendMicros: micros(metric.spendEur),
    registrations: metric.registrations,
    costPerRegistrationMicros: micros(metric.costPerRegistration),
    configuredMonthlyBudgetMicros: micros(metric.configuredMonthlyBudgetEur),
    activeMonthlyBudgetMicros: micros(metric.activeMonthlyBudgetEur),
    budgetStatus: metric.budgetStatus === "ok" ? "available" : metric.budgetStatus === "error" ? "error" : "unavailable",
    budgetDetail: metric.budgetDetail,
    campaignBudgets: metric.campaignBudgets,
    dataStatus: metric.status === "ok"
      ? metric.spendEur === null || metric.registrations === null ? "partial" : "available"
      : "unavailable",
  };
}

function otherMetricToKpi(metric: OtherReportingMetric, day: string): MarketingKpiInput {
  return {
    day,
    source: metric.source,
    window: metric.period,
    campaignStatus: metric.source === "linkedin" ? campaignSummary(metric.campaignBudgets) : null,
    currency: metric.currency ?? "EUR",
    spendMicros: micros(metric.spendEur),
    downloads: metric.resultLabel === "download" ? metric.resultCount : null,
    leads: metric.resultLabel === "lead aziendali" ? metric.resultCount : null,
    costPerLeadMicros: metric.resultLabel === "lead aziendali" ? micros(metric.costPerResult) : null,
    configuredMonthlyBudgetMicros: metric.source === "linkedin" ? micros(metric.configuredMonthlyBudgetEur) : null,
    activeMonthlyBudgetMicros: metric.source === "linkedin" ? micros(metric.activeMonthlyBudgetEur) : null,
    budgetStatus: metric.source === "linkedin" ? metric.budgetStatus === "ok" ? "available" : metric.budgetStatus === "error" ? "error" : "unavailable" : null,
    budgetDetail: metric.source === "linkedin" ? metric.budgetDetail : null,
    campaignBudgets: metric.source === "linkedin" ? metric.campaignBudgets : [],
    sourceUpdatedAt: metric.coverageEnd ? `${metric.coverageEnd}T12:00:00.000Z` : null,
    dataStatus: metric.status === "ok"
      ? metric.source === "linkedin"
        ? metric.spendEur !== null && metric.resultCount !== null ? "available" : "partial"
        : metric.resultCount !== null ? "available" : "partial"
      : "unavailable",
  };
}

function youtubeMetricToKpi(metric: YouTubeReportingMetric, day: string): MarketingKpiInput {
  const clicks = metric.annotationClicks === null && metric.cardClicks === null
    ? null
    : (metric.annotationClicks ?? 0) + (metric.cardClicks ?? 0);
  return {
    day,
    source: metric.source,
    window: metric.period,
    impressions: metric.views,
    clicks,
    dataStatus: metric.status === "ok"
      ? metric.views === null && clicks === null ? "partial" : "available"
      : "unavailable",
  };
}

function unavailableKpis(day: string, existing: Set<string>): MarketingKpiInput[] {
  const sources = ["google_ads_search", "linkedin", "google_ads_youtube", "google_ads_app", "app_store", "google_play"];
  return sources.flatMap((source) => PERIODS.flatMap((window) => {
    const key = `${source}:${window}`;
    return existing.has(key) ? [] : [{ day, source, window, dataStatus: "unavailable" as const }];
  }));
}

const QA_FILTER = `
  AND lower(COALESCE(au.email, '')) NOT LIKE '%+execlingo-qa_%'
  AND lower(COALESCE(ua.medium, '')) <> 'qa'
  AND lower(COALESCE(ua.source, '')) NOT IN ('test', 'verifica-mattutina', 'conversion_test')
  AND lower(COALESCE(ua.campaign, '')) NOT LIKE 'tracking_validation_%'
  AND lower(COALESCE(json_extract(e.meta, '$.medium'), '')) <> 'qa'
  AND lower(COALESCE(json_extract(e.meta, '$.src'), '')) NOT IN ('test', 'verifica-mattutina', 'conversion_test')
  AND lower(COALESCE(json_extract(e.meta, '$.campaign'), '')) NOT LIKE 'tracking_validation_%'`;

async function collectBackendKpis(day: string, client: Client): Promise<{
  kpis: MarketingKpiInput[];
  tracking: MarketingTrackingInput;
}> {
  const ranges: Array<{ window: "today" | "last7"; start: string }> = [
    { window: "today", start: day },
    { window: "last7", start: moveDate(day, -6) },
  ];
  const end = zonedStartOfDay(moveDate(day, 1)).toISOString();
  try {
    const kpis = await Promise.all(ranges.map(async ({ window, start }) => {
      const result = await client.execute({
        sql: `SELECT COUNT(DISTINCT COALESCE(e.user_id, e.id)) AS registrations
              FROM analytics_events e
              LEFT JOIN auth_users au ON au.id = e.user_id
              LEFT JOIN user_attribution ua ON ua.user_id = e.user_id
              WHERE e.name = 'register_done'
                AND datetime(e.created_at) >= datetime(?)
                AND datetime(e.created_at) < datetime(?)
                ${QA_FILTER}`,
        args: [zonedStartOfDay(start).toISOString(), end],
      });
      return {
        day,
        source: "backend",
        window,
        registrations: Number(result.rows[0]?.registrations ?? 0),
        dataStatus: "available" as const,
      };
    }));
    return {
      kpis,
      tracking: {
        source: "backend",
        event: "register_done",
        status: "verified",
        detail: "Registrazioni proprietarie disponibili; traffico QA escluso.",
      },
    };
  } catch {
    return {
      kpis: ranges.map(({ window }) => ({ day, source: "backend", window, dataStatus: "unavailable" })),
      tracking: {
        source: "backend",
        event: "register_done",
        status: "unavailable",
        detail: "Database ExecLingo non disponibile durante la raccolta.",
      },
    };
  }
}

function externalTracking(
  metrics: ReportingMetric[],
  googleAds: GoogleAdsReportingRow[],
  other: OtherReportingMetric[],
  youtubeOrganic: YouTubeReportingMetric[],
): MarketingTrackingInput[] {
  const check = (
    source: ReportingMetric["source"],
    event: string,
  ): MarketingTrackingInput => providerTrackingHealth(metrics, source, event);
  const googleCheck = (
    channel: "search" | "youtube" | "app",
    source: "google_ads" | "youtube" | "google_ads_app",
  ): MarketingTrackingInput => googleAdsTrackingHealth(googleAds, channel, source);
  const otherCheck = (
    source: OtherReportingMetric["source"],
    event: "lead_gen" | "download",
  ): MarketingTrackingInput => {
    const preferredPeriod = source === "linkedin" ? "today" : "last7";
    const metric = other.find((item) => item.source === source && item.period === preferredPeriod);
    if (!metric || metric.status === "not_configured") return { source, event, status: "unavailable", detail: metric?.detail ?? "API non configurata." };
    if (metric.status === "error") return { source, event, status: "blind", detail: metric.detail };
    return { source, event, status: metric.resultCount === null ? "unverified" : "verified", detail: metric.detail };
  };
  return [
    check("ga4", "sign_up"),
    check("meta", "CompleteRegistration"),
    googleCheck("search", "google_ads"),
    googleCheck("youtube", "youtube"),
    googleCheck("app", "google_ads_app"),
    otherCheck("linkedin", "lead_gen"),
    otherCheck("app_store", "download"),
    otherCheck("google_play", "download"),
    youtubeOrganicTrackingHealth(youtubeOrganic),
  ];
}

/**
 * YouTube Analytics data is not real-time. Prefer a provider-returned view
 * count from the inclusive seven-day window and fall back to today, while
 * preserving the distinction between an explicit zero and an absent row.
 */
export function youtubeOrganicTrackingHealth(
  metrics: YouTubeReportingMetric[],
): MarketingTrackingInput {
  const evidence = metrics.find((metric) =>
    metric.period === "last7" && metric.status === "ok" && metric.views !== null
  ) ?? metrics.find((metric) =>
    metric.period === "today" && metric.status === "ok" && metric.views !== null
  );
  if (evidence?.views !== null && evidence?.views !== undefined) {
    const period = evidence.period === "last7" ? "negli ultimi 7 giorni" : "oggi";
    return {
      source: "youtube_organic",
      event: "channel_analytics",
      status: "verified",
      detail: `${evidence.detail} YouTube ha restituito ${evidence.views} visualizzazioni ${period}.`,
    };
  }

  const preferred = metrics.find((metric) => metric.period === "last7")
    ?? metrics.find((metric) => metric.period === "today");
  if (!preferred || preferred.status === "not_configured") {
    return {
      source: "youtube_organic",
      event: "channel_analytics",
      status: "unavailable",
      detail: preferred?.detail ?? "YouTube Analytics non configurato.",
    };
  }
  const failed = metrics.find((metric) => metric.status === "error");
  if (failed) {
    return {
      source: "youtube_organic",
      event: "channel_analytics",
      status: "blind",
      detail: failed.detail,
    };
  }
  return {
    source: "youtube_organic",
    event: "channel_analytics",
    status: "unverified",
    detail: `${preferred.detail} Nessuna riga visualizzazioni è disponibile oggi o negli ultimi 7 giorni; il valore resta N/D.`,
  };
}

/**
 * Uses the seven-day provider row as the primary health signal. GA4 and Meta
 * can publish today's conversion aggregates with delay, so a real event in the
 * wider window must not be hidden by an empty today response. `null` remains
 * N/D; only a provider-returned number (including an explicit zero) is evidence.
 */
export function providerTrackingHealth(
  metrics: ReportingMetric[],
  source: ReportingMetric["source"],
  event: string,
): MarketingTrackingInput {
  const rows = metrics.filter((metric) => metric.source === source);
  const evidence = rows.find((metric) =>
    metric.period === "last7" && metric.status === "ok" && metric.resultCount !== null
  ) ?? rows.find((metric) =>
    metric.period === "today" && metric.status === "ok" && metric.resultCount !== null
  );

  if (evidence?.resultCount !== null && evidence?.resultCount !== undefined) {
    const period = evidence.period === "last7" ? "negli ultimi 7 giorni" : "oggi";
    return {
      source,
      event,
      status: "verified",
      detail: `${evidence.detail} Evento ${event} verificato: il provider ha restituito ${evidence.resultCount} conversioni ${period}.`,
    };
  }

  const preferred = rows.find((metric) => metric.period === "last7")
    ?? rows.find((metric) => metric.period === "today");
  if (!preferred || preferred.status === "not_configured") {
    return {
      source,
      event,
      status: "unavailable",
      detail: preferred?.detail ?? "API non configurata.",
    };
  }
  const failed = rows.find((metric) => metric.status === "error");
  if (failed) return { source, event, status: "blind", detail: failed.detail };

  return {
    source,
    event,
    status: "unverified",
    detail: `${preferred.detail} API leggibile, ma nessuna riga ${event} è disponibile oggi o negli ultimi 7 giorni; il valore resta N/D.`,
  };
}

/**
 * Reconciles Google Ads tracking health from the same allowlisted conversion
 * rows used by the KPI table. A non-null registration count is provider
 * evidence: unlike an absent row, an explicit zero is a real zero.
 *
 * Search and YouTube deliberately share GOOGLE_ADS_REGISTRATION_ACTION_IDS.
 * Therefore a positive conversion observed on either web channel verifies the
 * shared website action even when the sibling campaign has no attributed row
 * in the period. The sibling campaign result remains N/D in the KPI table; only
 * the common tag/action health is verified here. App actions stay isolated.
 */
export function googleAdsTrackingHealth(
  googleAds: GoogleAdsReportingRow[],
  channel: "search" | "youtube" | "app",
  source: "google_ads" | "youtube" | "google_ads_app",
): MarketingTrackingInput {
  const today = googleAds.find((item) => item.period === "today" && item.channel === channel);
  if (!today || today.status === "not_configured") {
    return {
      source,
      event: "registration",
      status: "unavailable",
      detail: today?.detail ?? "API Google Ads non configurata.",
    };
  }
  if (today.status === "error") {
    return { source, event: "registration", status: "blind", detail: today.detail };
  }

  const channelRows = googleAds.filter((item) => item.channel === channel && item.status === "ok");
  const direct = channelRows.find((item) => item.period === "last7" && item.registrations !== null)
    ?? channelRows.find((item) => item.period === "today" && item.registrations !== null);
  if (direct?.registrations !== null && direct?.registrations !== undefined) {
    const period = direct.period === "last7" ? "negli ultimi 7 giorni" : "oggi";
    return {
      source,
      event: "registration",
      status: "verified",
      detail: `${direct.detail} Azione Registrazione riconciliata: Google Ads ha restituito ${direct.registrations} conversioni ${period}.`,
    };
  }

  if (channel !== "app") {
    const siblingChannel = channel === "search" ? "youtube" : "search";
    const sharedEvidence = googleAds.find((item) =>
      item.channel === siblingChannel
      && item.period === "last7"
      && item.status === "ok"
      && item.registrations !== null
      && item.registrations > 0
    );
    if (sharedEvidence?.registrations !== null && sharedEvidence?.registrations !== undefined) {
      const siblingLabel = siblingChannel === "search" ? "Search" : "YouTube Ads";
      const channelLabel = channel === "search" ? "Search" : "YouTube Ads";
      return {
        source,
        event: "registration",
        status: "verified",
        detail: `${today.detail} Azione sito web condivisa verificata da ${sharedEvidence.registrations} conversioni attribuite a ${siblingLabel} negli ultimi 7 giorni; l'attribuzione specifica ${channelLabel} resta N/D finché Google Ads non restituisce una riga per questa campagna.`,
      };
    }
  }

  return {
    source,
    event: "registration",
    status: "unverified",
    detail: `${today.detail} API leggibile, ma nessuna riga allowlisted per Registrazione è disponibile oggi o negli ultimi 7 giorni.`,
  };
}

export type CollectedMarketingData = {
  kpis: MarketingKpiInput[];
  tracking: MarketingTrackingInput[];
  partial: boolean;
};

/** Reads provider APIs and the first-party database without changing campaigns. */
export async function collectMarketingData(now: Date = new Date(), client: Client = db()): Promise<CollectedMarketingData> {
  const day = localParts(now).date;
  const backendFallback = {
    kpis: PERIODS.map((window) => ({ day, source: "backend", window, dataStatus: "unavailable" as const })),
    tracking: { source: "backend", event: "register_done", status: "unavailable" as const, detail: "Database ExecLingo oltre il timeout di raccolta." },
  };
  const [ga4, meta, googleAds, linkedin, appStore, googlePlay, youtubeOrganic, backend] = await Promise.all([
    withProviderTimeout(collectGa4Reporting(now), reportingFailure("ga4", "web", "GA4 oltre il timeout di raccolta.")),
    withProviderTimeout(collectMetaReporting(now), reportingFailure("meta", "facebook_instagram", "Meta oltre il timeout di raccolta.")),
    withProviderTimeout(collectGoogleAdsReporting(now), googleAdsFailure("Google Ads oltre il timeout di raccolta.")),
    withProviderTimeout(collectLinkedInReporting(now), otherFailure("linkedin", "linkedin", "lead aziendali", "LinkedIn oltre il timeout di raccolta.")),
    withProviderTimeout(collectAppStoreReporting(now), otherFailure("app_store", "ios", "download", "App Store oltre il timeout di raccolta.")),
    withProviderTimeout(collectGooglePlayReporting(now), otherFailure("google_play", "android", "download", "Google Play oltre il timeout di raccolta.")),
    withProviderTimeout(collectYouTubeReporting(now), youtubeFailure("YouTube Analytics oltre il timeout di raccolta.")),
    withProviderTimeout(collectBackendKpis(day, client), backendFallback),
  ]);
  const external = [...ga4, ...meta];
  const other = [...linkedin, ...appStore, ...googlePlay];
  const externalKpis = [
    ...external.map((metric) => metricToKpi(metric, day)),
    ...googleAds.map((metric) => googleAdsToKpi(metric, day)),
    ...other.map((metric) => otherMetricToKpi(metric, day)),
    ...youtubeOrganic.map((metric) => youtubeMetricToKpi(metric, day)),
  ];
  const existing = new Set(externalKpis.map((kpi) => `${kpi.source}:${kpi.window}`));
  const kpis = [...backend.kpis, ...externalKpis, ...unavailableKpis(day, existing)];
  const tracking = [backend.tracking, ...externalTracking(external, googleAds, other, youtubeOrganic)];
  return {
    kpis,
    tracking,
    partial: kpis.some((kpi) => kpi.dataStatus !== "available") || tracking.some((check) => check.status !== "verified"),
  };
}

function moneyFromMicros(value: number | null): number | null {
  return value === null ? null : value / 1_000_000;
}

function rowFor(kpis: MarketingKpi[], source: string, window: "today" | "last7"): MarketingKpi | null {
  return kpis.find((item) => item.source === source && item.window === window) ?? null;
}

function combineStatus(today: MarketingKpi | null, last7: MarketingKpi | null): MarketingReportChannel["status"] {
  const rows = [today, last7].filter((row): row is MarketingKpi => Boolean(row));
  if (!rows.length || rows.every((row) => row.dataStatus === "unavailable")) return "unavailable";
  return rows.every((row) => row.dataStatus === "available") ? "available" : "partial";
}

function channel(
  snapshot: MarketingSnapshot,
  source: string,
  label: string,
  resultLabel: string,
  detail: string,
): MarketingReportChannel {
  const today = rowFor(snapshot.kpis, source, "today");
  const last7 = rowFor(snapshot.kpis, source, "last7");
  const leads = resultLabel === "lead aziendali";
  const trackingSource = source === "google_ads_search"
    ? "google_ads"
    : source === "google_ads_youtube" ? "youtube" : source;
  const providerDetail = snapshot.tracking.find((item) => item.source === trackingSource)?.detail;
  return {
    source,
    label,
    spendTodayEur: moneyFromMicros(today?.spendMicros ?? null),
    spend7dEur: moneyFromMicros(last7?.spendMicros ?? null),
    resultsToday: resultLabel === "visualizzazioni" ? today?.impressions ?? null : leads ? today?.leads ?? null : today?.registrations ?? today?.downloads ?? null,
    results7d: resultLabel === "visualizzazioni" ? last7?.impressions ?? null : leads ? last7?.leads ?? null : last7?.registrations ?? last7?.downloads ?? null,
    resultLabel,
    costPerResult7dEur: moneyFromMicros(
      leads ? last7?.costPerLeadMicros ?? null : last7?.costPerRegistrationMicros ?? null,
    ),
    campaignStatus: today?.campaignStatus ?? last7?.campaignStatus ?? null,
    dataThrough: last7?.sourceUpdatedAt ?? today?.sourceUpdatedAt ?? null,
    configuredMonthlyBudgetEur: moneyFromMicros(today?.configuredMonthlyBudgetMicros ?? last7?.configuredMonthlyBudgetMicros ?? null),
    activeMonthlyBudgetEur: moneyFromMicros(today?.activeMonthlyBudgetMicros ?? last7?.activeMonthlyBudgetMicros ?? null),
    budgetStatus: today?.budgetStatus ?? last7?.budgetStatus ?? null,
    budgetDetail: today?.budgetDetail ?? last7?.budgetDetail ?? null,
    status: combineStatus(today, last7),
    detail: providerDetail ? `${detail}. ${providerDetail}` : detail,
  };
}

/**
 * Sums paid-channel spend without allowing an unfunded, absent source to turn
 * the whole KPI into N/D. If that optional source does report spend, it is
 * included so it cannot disappear from the total.
 */
export function sumPaidChannelSpend(
  channels: ReadonlyArray<Pick<MarketingReportChannel, "source" | "spendTodayEur" | "spend7dEur">>,
  field: "spendTodayEur" | "spend7dEur",
): number | null {
  let total = 0;
  for (const plan of MARKETING_BUDGET_PLAN) {
    const value = channels.find((item) => item.source === plan.source)?.[field] ?? null;
    if (value === null) {
      if (plan.monthlyEur > 0) return null;
      continue;
    }
    total += value;
  }
  return Number(total.toFixed(2));
}

function actualBudget(channels: MarketingReportChannel[]): {
  active: number | null;
  configured: number | null;
  status: "verified" | "unavailable" | "over_cap";
} {
  const planned = new Map<string, number>(MARKETING_BUDGET_PLAN.map((item) => [item.source, item.monthlyEur]));
  const paid = channels.filter((item) => planned.has(item.source as (typeof MARKETING_BUDGET_PLAN)[number]["source"]));
  const required = paid.filter((item) => (planned.get(item.source) ?? 0) > 0);
  const optional = paid.filter((item) => (planned.get(item.source) ?? 0) === 0);
  const complete = required.length === MARKETING_BUDGET_PLAN.filter((item) => item.monthlyEur > 0).length
    && required.every((item) => item.budgetStatus === "available" && item.activeMonthlyBudgetEur !== null);
  if (!complete) return { active: null, configured: null, status: "unavailable" };
  // A zero-plan source with no campaign is optional, but if the API does
  // return a budget it must still be counted so an unauthorised App campaign
  // cannot hide outside the global cap.
  const readableOptional = optional.filter((item) => item.budgetStatus === "available");
  const included = [...required, ...readableOptional];
  const active = Number(included.reduce((sum, item) => sum + (item.activeMonthlyBudgetEur ?? 0), 0).toFixed(2));
  const configured = included.every((item) => item.configuredMonthlyBudgetEur !== null)
    ? Number(included.reduce((sum, item) => sum + (item.configuredMonthlyBudgetEur ?? 0), 0).toFixed(2))
    : null;
  return { active, configured, status: active > MONTHLY_BUDGET_CAP_EUR ? "over_cap" : "verified" };
}

function snapshotFreshness(snapshot: MarketingSnapshot, now: Date): "fresh" | "stale" {
  const timestamp = Date.parse(snapshot.run.completedAt ?? snapshot.run.updatedAt);
  if (!Number.isFinite(timestamp)) return "stale";
  return now.getTime() - timestamp > MARKETING_SNAPSHOT_STALE_AFTER_MS ? "stale" : "fresh";
}

/** Builds the same source-of-truth report used by email and the Admin UI. */
export function buildMarketingReport(snapshot: MarketingSnapshot, now: Date = new Date()): MarketingReport {
  const generatedAt = snapshot.run.completedAt ?? snapshot.run.updatedAt;
  const freshness = snapshotFreshness(snapshot, now);
  const rawChannels = [
    channel(snapshot, "google_ads_search", "Google Ads Search", "registrazioni", "Campagna B2C Search"),
    channel(snapshot, "meta", "Facebook + Instagram", "registrazioni", "Campagne Meta B2C"),
    channel(snapshot, "linkedin", "LinkedIn", "lead aziendali", "Lead Gen HR/L&D"),
    channel(snapshot, "google_ads_youtube", "YouTube Ads", "registrazioni", "Campagna video B2C"),
    channel(snapshot, "google_ads_app", "Google Ads App", "registrazioni", "Test Android install-only: richiede app catalogata, preflight e permessi verdi, con budget riallocato prima dell'avvio"),
    channel(snapshot, "youtube_organic", "YouTube organico", "visualizzazioni", "Canale ExecLingo"),
    channel(snapshot, "ga4", "GA4", "registrazioni", "Evento sign_up"),
    channel(snapshot, "app_store", "App Store", "download", "Download iOS"),
    channel(snapshot, "google_play", "Google Play", "download", "Download Android"),
    channel(snapshot, "backend", "Backend ExecLingo", "registrazioni", "Account validi, QA esclusi"),
  ];
  const channels = freshness === "stale"
    ? rawChannels.map((item) => item.status === "unavailable" ? item : {
      ...item,
      status: "stale" as const,
      detail: `Snapshot non aggiornato del ${formatRomeDate(generatedAt)}; soglia ${MARKETING_SNAPSHOT_STALE_AFTER_HOURS} ore. ${item.detail}`,
    })
    : rawChannels;
  const tracking = freshness === "stale"
    ? snapshot.tracking.map((item) => ["verified", "unverified"].includes(item.status) ? {
      ...item,
      status: "stale" as const,
      detail: `Snapshot non aggiornato del ${formatRomeDate(generatedAt)}; soglia ${MARKETING_SNAPSHOT_STALE_AFTER_HOURS} ore. ${item.detail ?? ""}`.trim(),
    } : item)
    : snapshot.tracking;
  const unavailable = channels.filter((item) => item.status === "unavailable");
  const blind = tracking.filter((item) => ["blind", "unavailable"].includes(item.status));
  const budgetActual = actualBudget(channels);
  const budgetVerification = budgetActual.status === "verified" && freshness === "stale"
    ? "stale" as const
    : budgetActual.status;
  const semaphore = blind.length > 0 || budgetActual.status === "over_cap" ? "Rosso" : freshness === "stale" || unavailable.length > 0 || budgetActual.status === "unavailable" || snapshot.run.status === "partial" ? "Giallo" : "Verde";
  const availableChannels = channels.filter((item) => item.status === "available").length;
  const summary = [
    freshness === "stale"
      ? `Snapshot API non aggiornato: dati del ${formatRomeDate(generatedAt)}, oltre la soglia di ${MARKETING_SNAPSHOT_STALE_AFTER_HOURS} ore.`
      : `${availableChannels}/${channels.length} fonti restituiscono dati completi; i valori mancanti sono indicati come N/D.`,
    budgetVerification === "stale"
      ? `Ultimo budget reale attivo letto: ${formatEuro(budgetActual.active ?? 0)}; aggiornare i dati prima di qualsiasi decisione.`
      : budgetActual.status === "unavailable"
      ? `Piano autorizzato ${formatEuro(MARKETING_BUDGET_TOTAL_EUR)}; budget reali non ancora verificabili, quindi nessuna modifica automatica.`
      : `Budget reali attivi ${formatEuro(budgetActual.active ?? 0)} su ${formatEuro(MONTHLY_BUDGET_CAP_EUR)}: ${budgetActual.status === "over_cap" ? "TETTO SUPERATO" : "tetto rispettato"}.`,
    freshness === "stale"
      ? "Tracking conversioni non presentato come corrente: aggiornare lo snapshot prima di valutarlo."
      : blind.length
        ? `${blind.length} controlli di conversione richiedono ancora un collegamento o una verifica.`
        : "Tracking conversioni verificato sulle fonti collegate.",
  ];
  const priorities = [
    ...(snapshot.run.emailStatus === "failed" ? ["Invio email del report fallito: il prossimo wake-up ritenterà solo la consegna."] : []),
    ...(budgetActual.status === "over_cap" ? [`Budget reali attivi ${formatEuro(budgetActual.active ?? 0)}: superano il tetto mensile di ${formatEuro(MONTHLY_BUDGET_CAP_EUR)}.`] : []),
    ...(freshness === "stale" ? [`Aggiornare lo snapshot API: ultimo dato del ${formatRomeDate(generatedAt)}, soglia ${MARKETING_SNAPSHOT_STALE_AFTER_HOURS} ore.`] : []),
    ...(budgetActual.status === "unavailable" ? ["Completare la lettura dei budget reali prima di qualsiasi ribilanciamento."] : []),
    ...unavailable.slice(0, 4).map((item) => `Collegare o ripristinare ${item.label}.`),
    ...tracking.filter((item) => item.status === "unverified").map((item) => `Verificare ${item.source}: ${item.event}.`),
  ].slice(0, 5);
  return {
    generatedAt,
    title: `ExecLingo — Report performance | ${formatRomeDate(generatedAt)}`,
    semaphore,
    summary,
    channels,
    tracking,
    budget: MARKETING_BUDGET_PLAN,
    budgetTotalEur: MARKETING_BUDGET_TOTAL_EUR,
    budgetCapEur: MONTHLY_BUDGET_CAP_EUR,
    actualActiveBudgetEur: budgetActual.active,
    actualConfiguredBudgetEur: budgetActual.configured,
    budgetVerification,
    snapshotFreshness: freshness,
    staleAfterHours: MARKETING_SNAPSHOT_STALE_AFTER_HOURS,
    modifications: ["Nessuna modifica automatica ai budget: le fonti cieche non vengono usate per ribilanciare la spesa."],
    priorities: priorities.length ? priorities : ["Nessun problema prioritario rilevato."],
    nextAction: "Quando servono dati nuovi, aprire ADMIN e selezionare «Aggiorna dati»; l'invio email resta un'azione separata.",
  };
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value);
}

function formatNumber(value: number | null): string {
  return value === null ? "N/D" : new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(value);
}

function formatMaybeEuro(value: number | null): string {
  return value === null ? "N/D" : formatEuro(value);
}

function formatRomeDate(value: Date | string): string {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: MARKETING_TIME_ZONE,
  }).format(value instanceof Date ? value : new Date(value));
}

function formatRomeDay(value: Date | string): string {
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeZone: MARKETING_TIME_ZONE })
    .format(value instanceof Date ? value : new Date(value));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}

export function renderMarketingReportText(report: MarketingReport): string {
  const kpis = report.channels.map((item) => [
    item.label,
    formatMaybeEuro(item.spendTodayEur),
    formatMaybeEuro(item.spend7dEur),
    `${formatNumber(item.results7d)} ${item.resultLabel}`,
    formatMaybeEuro(item.costPerResult7dEur),
    `${item.status}${item.dataThrough ? ` · fino al ${formatRomeDay(item.dataThrough)}` : ""}`,
  ].join(" | "));
  return [
    report.title,
    `Semaforo complessivo: ${report.semaphore}`,
    `Dati API: ${report.snapshotFreshness === "stale" ? `non aggiornati · snapshot del ${formatRomeDate(report.generatedAt)} · soglia ${report.staleAfterHours} ore` : `aggiornati al ${formatRomeDate(report.generatedAt)}`}`,
    ...report.summary,
    "",
    "KPI — Canale | Spesa oggi | Spesa 7 giorni | Risultati 7 giorni | CPR/CPL | Stato",
    ...kpis,
    "",
    "Tracking conversioni",
    ...report.tracking.map((item) => `${item.source} · ${item.event}: ${item.status}${item.detail ? ` — ${item.detail}` : ""}`),
    "",
    `Budget autorizzato: ${report.budget.map((item) => `${item.label} ${formatEuro(item.monthlyEur)}`).join(" · ")} · Totale ${formatEuro(report.budgetTotalEur)}`,
    `Budget reale attivo: ${report.actualActiveBudgetEur === null ? "N/D" : formatEuro(report.actualActiveBudgetEur)} · verifica ${report.budgetVerification}`,
    "",
    "Modifiche effettuate",
    ...report.modifications,
    "",
    "Problemi prioritari",
    ...report.priorities.map((item, index) => `${index + 1}. ${item}`),
    "",
    `Prossima azione automatica: ${report.nextAction}`,
  ].join("\n");
}

export function renderMarketingReportHtml(report: MarketingReport): string {
  const tone = report.semaphore === "Verde" ? "#16845b" : report.semaphore === "Giallo" ? "#a56600" : "#bd2c2c";
  const rows = report.channels.map((item) => `
    <tr>
      <td style="padding:9px;border-bottom:1px solid #e6e9e2"><strong>${escapeHtml(item.label)}</strong><br><small style="color:#667066">${escapeHtml(item.detail)}</small></td>
      <td style="padding:9px;border-bottom:1px solid #e6e9e2">${formatMaybeEuro(item.spendTodayEur)}</td>
      <td style="padding:9px;border-bottom:1px solid #e6e9e2">${formatMaybeEuro(item.spend7dEur)}</td>
      <td style="padding:9px;border-bottom:1px solid #e6e9e2">${formatNumber(item.results7d)} ${escapeHtml(item.resultLabel)}</td>
      <td style="padding:9px;border-bottom:1px solid #e6e9e2">${formatMaybeEuro(item.costPerResult7dEur)}</td>
      <td style="padding:9px;border-bottom:1px solid #e6e9e2">${escapeHtml(item.status === "available" ? "Disponibile" : item.status === "partial" ? "Parziale" : item.status === "stale" ? "Non aggiornato" : "N/D")}${item.campaignStatus ? `<br><small>${escapeHtml(item.campaignStatus)}</small>` : ""}${item.dataThrough ? `<br><small>fino al ${formatRomeDay(item.dataThrough)}</small>` : ""}</td>
    </tr>`).join("");
  const tracking = report.tracking.map((item) => `<li style="margin:5px 0"><strong>${escapeHtml(item.source)}</strong> · ${escapeHtml(item.event)}: ${escapeHtml(item.status)}${item.detail ? ` — ${escapeHtml(item.detail)}` : ""}</li>`).join("");
  const priorities = report.priorities.map((item) => `<li style="margin:5px 0">${escapeHtml(item)}</li>`).join("");
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#f5f6f3;color:#18201a;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
    <div style="max-width:820px;margin:0 auto;padding:24px 14px">
      <div style="background:#fff;border:1px solid #e1e5de;border-radius:16px;padding:26px">
        <div style="font-size:13px;font-weight:800;letter-spacing:.08em;color:#2f8f63">EXECLINGO · VASP ITALIA SRL</div>
        <h1 style="font-size:23px;margin:10px 0 14px">${escapeHtml(report.title)}</h1>
        <div style="display:inline-block;background:${tone};color:white;border-radius:999px;padding:7px 12px;font-weight:700">Semaforo: ${report.semaphore}</div>
        <p style="margin:10px 0 0;line-height:1.5"><strong>Dati API:</strong> ${report.snapshotFreshness === "stale" ? `non aggiornati · snapshot del ${formatRomeDate(report.generatedAt)} · soglia ${report.staleAfterHours} ore` : `aggiornati al ${formatRomeDate(report.generatedAt)}`}</p>
        ${report.summary.map((item) => `<p style="margin:10px 0 0;line-height:1.5">${escapeHtml(item)}</p>`).join("")}
        <h2 style="font-size:18px;margin:28px 0 10px">KPI</h2>
        <div style="overflow-x:auto"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f0f3ee;text-align:left"><th style="padding:9px">Canale</th><th style="padding:9px">Oggi</th><th style="padding:9px">7 giorni</th><th style="padding:9px">Risultati</th><th style="padding:9px">CPR/CPL</th><th style="padding:9px">Stato</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <h2 style="font-size:18px;margin:28px 0 8px">Tracking conversioni</h2><ul style="padding-left:20px">${tracking}</ul>
        <h2 style="font-size:18px;margin:28px 0 8px">Budget</h2>
        <p>${report.budget.map((item) => `<strong>${escapeHtml(item.label)}</strong> ${formatEuro(item.monthlyEur)}`).join(" · ")}<br>Piano <strong>${formatEuro(report.budgetTotalEur)}</strong> su ${formatEuro(report.budgetCapEur)}.<br>Budget reale attivo: <strong>${report.actualActiveBudgetEur === null ? "N/D" : formatEuro(report.actualActiveBudgetEur)}</strong> · ${escapeHtml(report.budgetVerification)}.</p>
        <h2 style="font-size:18px;margin:28px 0 8px">Modifiche effettuate</h2>${report.modifications.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
        <h2 style="font-size:18px;margin:28px 0 8px">Problemi prioritari</h2><ol style="padding-left:20px">${priorities}</ol>
        <h2 style="font-size:18px;margin:28px 0 8px">Prossima azione automatica</h2><p>${escapeHtml(report.nextAction)}</p>
      </div>
    </div>
  </body></html>`;
}

export type MarketingRunResult = {
  snapshot: MarketingSnapshot;
  report: MarketingReport;
  emailSent: boolean;
};

export type ExecuteMarketingRunOptions = {
  /** Defaults to true for scheduled jobs; ADMIN can refresh without emailing. */
  sendReportEmail?: boolean;
};

/** Persists and closes an already claimed collector run, with optional email. */
export async function executeClaimedMarketingRun(
  runKey: string,
  now: Date = new Date(),
  client: Client = db(),
  options: ExecuteMarketingRunOptions = {},
): Promise<MarketingRunResult> {
  try {
    if (MARKETING_BUDGET_TOTAL_EUR > MONTHLY_BUDGET_CAP_EUR) throw new Error("budget_cap_exceeded");
    const collected = await collectMarketingData(now, client);
    await upsertMarketingKpis(runKey, collected.kpis, client, now);
    await upsertMarketingTrackingHealth(runKey, collected.tracking, client, now);
    const provisional: MarketingSnapshot = {
      run: {
        runKey,
        scheduledFor: now.toISOString(),
        status: collected.partial ? "partial" : "success",
        startedAt: now.toISOString(),
        completedAt: now.toISOString(),
        failureCode: null,
        emailStatus: "pending",
        emailAttemptedAt: null,
        emailSentAt: null,
        updatedAt: now.toISOString(),
      },
      kpis: collected.kpis.map((item) => ({
        ...item,
        runKey,
        accountId: item.accountId ?? null,
        campaignId: item.campaignId ?? null,
        campaignName: item.campaignName ?? null,
        campaignStatus: item.campaignStatus ?? null,
        currency: item.currency ?? "EUR",
        spendMicros: item.spendMicros ?? null,
        impressions: item.impressions ?? null,
        clicks: item.clicks ?? null,
        downloads: item.downloads ?? null,
        registrations: item.registrations ?? null,
        leads: item.leads ?? null,
        costPerRegistrationMicros: item.costPerRegistrationMicros ?? null,
        costPerLeadMicros: item.costPerLeadMicros ?? null,
        configuredMonthlyBudgetMicros: item.configuredMonthlyBudgetMicros ?? null,
        activeMonthlyBudgetMicros: item.activeMonthlyBudgetMicros ?? null,
        budgetStatus: item.budgetStatus ?? null,
        budgetDetail: item.budgetDetail ?? null,
        campaignBudgets: item.campaignBudgets ?? [],
        sourceUpdatedAt: item.sourceUpdatedAt ? new Date(item.sourceUpdatedAt).toISOString() : null,
        collectedAt: now.toISOString(),
      })),
      tracking: collected.tracking.map((item) => ({
        ...item,
        runKey,
        lastConversionAt: item.lastConversionAt ? new Date(item.lastConversionAt).toISOString() : null,
        detail: item.detail ?? null,
        checkedAt: now.toISOString(),
      })),
    };
    const report = buildMarketingReport(provisional, now);
    const sendReportEmail = options.sendReportEmail ?? true;
    let emailSent = false;
    if (sendReportEmail) {
      const configuredRecipient = (process.env.MARKETING_REPORT_TO ?? "").trim().toLowerCase();
      // This operational report is intentionally restricted to the authorised
      // owner address; a stray deployment variable must not leak campaign data.
      const recipient = configuredRecipient === MARKETING_REPORT_RECIPIENT
        ? configuredRecipient
        : MARKETING_REPORT_RECIPIENT;
      emailSent = await sendEmail(recipient, report.title, renderMarketingReportHtml(report), renderMarketingReportText(report));
      await markMarketingEmail(runKey, emailSent, client, new Date());
    }
    const outcome = collected.partial || (sendReportEmail && !emailSent) ? "partial" : "success";
    const completedRun = await completeMarketingRun(runKey, outcome, client, new Date());
    const snapshot = { ...provisional, run: completedRun };
    return { snapshot, report: buildMarketingReport(snapshot, now), emailSent };
  } catch (error) {
    await failMarketingRun(runKey, error instanceof Error && error.message === "budget_cap_exceeded" ? "budget_cap_exceeded" : "collector_failed", client).catch(() => undefined);
    throw error;
  }
}

/** Retries only the mandatory email for a completed snapshot; provider APIs are not called again. */
export async function retryMarketingReportEmail(
  runKey: string,
  client: Client = db(),
): Promise<{ attempted: boolean; sent: boolean }> {
  const snapshot = await readMarketingSnapshot(runKey, client);
  if (!snapshot || snapshot.run.emailStatus === "sent") {
    return { attempted: false, sent: snapshot?.run.emailStatus === "sent" };
  }
  const report = buildMarketingReport(snapshot);
  const configuredRecipient = (process.env.MARKETING_REPORT_TO ?? "").trim().toLowerCase();
  const recipient = configuredRecipient === MARKETING_REPORT_RECIPIENT
    ? configuredRecipient
    : MARKETING_REPORT_RECIPIENT;
  const sent = await sendEmail(recipient, report.title, renderMarketingReportHtml(report), renderMarketingReportText(report));
  await markMarketingEmail(runKey, sent, client);
  return { attempted: true, sent };
}

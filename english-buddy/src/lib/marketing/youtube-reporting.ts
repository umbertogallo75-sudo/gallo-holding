/**
 * Read-only YouTube Analytics adapter for the owned ExecLingo channel.
 *
 * The API exposes aggregate clicks on annotations and cards, but it does not
 * identify which of those clicks reached execlingo.it. Keep those values
 * separate and never label or infer them as website traffic.
 */

export type YouTubeReportingPeriod = "today" | "last7";
export type YouTubeReportingStatus = "ok" | "not_configured" | "error";

export type YouTubeReportingMetric = {
  source: "youtube_organic";
  channel: "youtube";
  period: YouTubeReportingPeriod;
  views: number | null;
  annotationClicks: number | null;
  cardClicks: number | null;
  status: YouTubeReportingStatus;
  detail: string;
};

export type YouTubeReportingValues = Pick<
  YouTubeReportingMetric,
  "views" | "annotationClicks" | "cardClicks"
>;

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type PeriodRange = {
  period: YouTubeReportingPeriod;
  startDate: string;
  endDate: string;
};
type YouTubeConfig = {
  channelId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

const REPORT_TIME_ZONE = "Europe/Rome";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_ANALYTICS_REPORT_URL = "https://youtubeanalytics.googleapis.com/v2/reports";
const CORE_METRICS = ["views"] as const;
const OPTIONAL_INTERACTION_METRICS = ["annotationClicks", "cardClicks"] as const;
const REQUESTED_METRICS = [...CORE_METRICS, ...OPTIONAL_INTERACTION_METRICS] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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

function blankValues(): YouTubeReportingValues {
  return { views: null, annotationClicks: null, cardClicks: null };
}

function metric(
  period: YouTubeReportingPeriod,
  status: YouTubeReportingStatus,
  detail: string,
  values: YouTubeReportingValues = blankValues(),
): YouTubeReportingMetric {
  return {
    source: "youtube_organic",
    channel: "youtube",
    period,
    ...values,
    status,
    detail,
  };
}

function readConfig(): { config: YouTubeConfig | null; detail: string | null } {
  const config = {
    channelId: (process.env.YOUTUBE_CHANNEL_ID ?? "").trim(),
    clientId: (process.env.YOUTUBE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? "").trim(),
    clientSecret: (process.env.YOUTUBE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "").trim(),
    refreshToken: (process.env.YOUTUBE_REFRESH_TOKEN ?? "").trim(),
  };
  const missing = [
    !config.channelId && "YOUTUBE_CHANNEL_ID",
    !config.clientId && "YOUTUBE_CLIENT_ID",
    !config.clientSecret && "YOUTUBE_CLIENT_SECRET",
    !config.refreshToken && "YOUTUBE_REFRESH_TOKEN",
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    return { config: null, detail: `Variabili mancanti: ${missing.join(", ")}.` };
  }
  return { config, detail: null };
}

/**
 * Parses a YouTube Analytics reports.query response by column name. Missing
 * rows or cells stay null; a provider-supplied zero remains zero.
 */
export function parseYouTubeAnalyticsPayload(payload: unknown): YouTubeReportingValues {
  if (!isRecord(payload) || !Array.isArray(payload.columnHeaders) || !Array.isArray(payload.rows)) {
    return blankValues();
  }

  const indexes = new Map<string, number>();
  payload.columnHeaders.forEach((rawHeader, index) => {
    if (isRecord(rawHeader) && typeof rawHeader.name === "string") {
      indexes.set(rawHeader.name, index);
    }
  });

  const totals: Record<(typeof REQUESTED_METRICS)[number], number> = {
    views: 0,
    annotationClicks: 0,
    cardClicks: 0,
  };
  const seen: Record<(typeof REQUESTED_METRICS)[number], boolean> = {
    views: false,
    annotationClicks: false,
    cardClicks: false,
  };

  for (const rawRow of payload.rows) {
    if (!Array.isArray(rawRow)) continue;
    for (const name of REQUESTED_METRICS) {
      const index = indexes.get(name);
      if (index === undefined) continue;
      const value = apiNumber(rawRow[index]);
      if (value === null) continue;
      totals[name] += value;
      seen[name] = true;
    }
  }

  return {
    views: seen.views ? totals.views : null,
    annotationClicks: seen.annotationClicks ? totals.annotationClicks : null,
    cardClicks: seen.cardClicks ? totals.cardClicks : null,
  };
}

async function refreshAccessToken(
  config: YouTubeConfig,
  fetcher: Fetcher,
): Promise<{ token: string | null; detail: string | null }> {
  try {
    const response = await fetcher(GOOGLE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!response.ok) {
      return { token: null, detail: `OAuth YouTube: HTTP ${response.status}.` };
    }
    const payload: unknown = await response.json().catch(() => null);
    const token = isRecord(payload) && typeof payload.access_token === "string"
      ? payload.access_token.trim()
      : "";
    return token
      ? { token, detail: null }
      : { token: null, detail: "OAuth YouTube: access token assente nella risposta." };
  } catch {
    return { token: null, detail: "OAuth YouTube non raggiungibile." };
  }
}

function reportUrl(channelId: string, range: PeriodRange, metrics: readonly string[]): string {
  const params = new URLSearchParams({
    ids: `channel==${channelId}`,
    startDate: range.startDate,
    endDate: range.endDate,
    metrics: metrics.join(","),
  });
  return `${YOUTUBE_ANALYTICS_REPORT_URL}?${params}`;
}

async function fetchPeriod(
  config: YouTubeConfig,
  token: string,
  range: PeriodRange,
  fetcher: Fetcher,
): Promise<YouTubeReportingMetric> {
  try {
    // Keep the core view count independent from optional/legacy interaction
    // metrics. YouTube only returns dates for which every requested metric is
    // available, so requesting them together can hide valid views when cards
    // or annotations have no data for the channel.
    const response = await fetcher(reportUrl(config.channelId, range, CORE_METRICS), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return metric(range.period, "error", `YouTube Analytics API: HTTP ${response.status}.`);
    }
    const payload: unknown = await response.json().catch(() => null);
    const coreValues = parseYouTubeAnalyticsPayload(payload);
    if (coreValues.views === null) {
      return metric(
        range.period,
        "ok",
        "YouTube Analytics API: nessuna riga visualizzazioni disponibile nel periodo (N/D, non zero).",
      );
    }

    let values: YouTubeReportingValues = {
      views: coreValues.views,
      annotationClicks: null,
      cardClicks: null,
    };
    let interactionsAvailable = false;
    try {
      const interactionResponse = await fetcher(
        reportUrl(config.channelId, range, OPTIONAL_INTERACTION_METRICS),
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (interactionResponse.ok) {
        const interactionPayload: unknown = await interactionResponse.json().catch(() => null);
        const interactionValues = parseYouTubeAnalyticsPayload(interactionPayload);
        values = {
          ...values,
          annotationClicks: interactionValues.annotationClicks,
          cardClicks: interactionValues.cardClicks,
        };
        interactionsAvailable = interactionValues.annotationClicks !== null
          || interactionValues.cardClicks !== null;
      }
    } catch {
      // Interaction metrics are supplementary and must never suppress a valid
      // core view count.
    }

    const detail = interactionsAvailable
      ? "YouTube Analytics API: visualizzazioni e interazioni organiche disponibili; i click su annotazioni e schede non provano traffico verso il sito."
      : "YouTube Analytics API: visualizzazioni organiche disponibili; interazioni su annotazioni e schede N/D.";
    return metric(range.period, "ok", detail, values);
  } catch {
    return metric(range.period, "error", "YouTube Analytics API non raggiungibile.");
  }
}

/**
 * Collects organic channel analytics for today and the inclusive last seven
 * Rome calendar days. This function never mutates YouTube or Google Ads state.
 */
export async function collectYouTubeReporting(
  now: Date = new Date(),
  fetcher: Fetcher = fetch,
): Promise<YouTubeReportingMetric[]> {
  const ranges = periodRanges(now);
  const { config, detail } = readConfig();
  if (!config) {
    return ranges.map(({ period }) => metric(period, "not_configured", detail ?? "YouTube non configurato."));
  }

  const access = await refreshAccessToken(config, fetcher);
  if (!access.token) {
    return ranges.map(({ period }) => metric(period, "error", access.detail ?? "OAuth YouTube non disponibile."));
  }

  return Promise.all(ranges.map((range) => fetchPeriod(config, access.token!, range, fetcher)));
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectYouTubeReporting,
  parseYouTubeAnalyticsPayload,
} from "@/lib/marketing/youtube-reporting";

const ENV_NAMES = [
  "YOUTUBE_CHANNEL_ID",
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "YOUTUBE_REFRESH_TOKEN",
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

function configureYouTube() {
  process.env.YOUTUBE_CHANNEL_ID = "UCExecLingo123";
  process.env.YOUTUBE_CLIENT_ID = "youtube-client";
  process.env.YOUTUBE_CLIENT_SECRET = "youtube-secret";
  process.env.YOUTUBE_REFRESH_TOKEN = "youtube-refresh-secret";
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("YouTube organic reporting adapter", () => {
  it("returns nullable not_configured rows without network calls", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const rows = await collectYouTubeReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(fetcher).not.toHaveBeenCalled();
    expect(rows.map((row) => row.period)).toEqual(["today", "last7"]);
    for (const row of rows) {
      expect(row.status).toBe("not_configured");
      expect(row.views).toBeNull();
      expect(row.annotationClicks).toBeNull();
      expect(row.cardClicks).toBeNull();
    }
  });

  it("falls back to the shared Google OAuth client", async () => {
    configureYouTube();
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.YOUTUBE_CLIENT_SECRET;
    process.env.GOOGLE_CLIENT_ID = "shared-google-client";
    process.env.GOOGLE_CLIENT_SECRET = "shared-google-secret";
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("client_id")).toBe("shared-google-client");
      expect(body.get("client_secret")).toBe("shared-google-secret");
      return jsonResponse({ error: "invalid_grant" }, 400);
    });

    const rows = await collectYouTubeReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(rows.every((row) => row.status === "error")).toBe(true);
  });

  it("prefers the YouTube OAuth client over the shared fallback", async () => {
    configureYouTube();
    process.env.GOOGLE_CLIENT_ID = "shared-google-client";
    process.env.GOOGLE_CLIENT_SECRET = "shared-google-secret";
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("client_id")).toBe("youtube-client");
      expect(body.get("client_secret")).toBe("youtube-secret");
      return jsonResponse({ error: "invalid_grant" }, 400);
    });

    await collectYouTubeReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("parses by header name, sums rows and preserves explicit zero", () => {
    expect(parseYouTubeAnalyticsPayload({
      columnHeaders: [
        { name: "cardClicks" },
        { name: "views" },
        { name: "annotationClicks" },
      ],
      rows: [[2, 40, 0], [3, 2, null]],
    })).toEqual({ views: 42, annotationClicks: 0, cardClicks: 5 });

    expect(parseYouTubeAnalyticsPayload({ columnHeaders: [], rows: [] })).toEqual({
      views: null,
      annotationClicks: null,
      cardClicks: null,
    });
  });

  it("refreshes OAuth once and queries today and last7 with read-only report calls", async () => {
    configureYouTube();
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      if (url.origin === "https://oauth2.googleapis.com") {
        expect(init?.method).toBe("POST");
        expect(String(init?.body)).toContain("grant_type=refresh_token");
        return jsonResponse({ access_token: "short-lived-youtube-token" });
      }

      expect(url.origin + url.pathname).toBe("https://youtubeanalytics.googleapis.com/v2/reports");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer short-lived-youtube-token");
      expect(url.searchParams.get("ids")).toBe("channel==UCExecLingo123");
      expect(url.searchParams.get("endDate")).toBe("2026-08-28");
      const isToday = url.searchParams.get("startDate") === "2026-08-28";
      if (!isToday) expect(url.searchParams.get("startDate")).toBe("2026-08-22");

      if (url.searchParams.get("metrics") === "views") {
        return jsonResponse({
          columnHeaders: [{ name: "views", columnType: "METRIC", dataType: "INTEGER" }],
          rows: [isToday ? [0] : [120]],
        });
      }

      expect(url.searchParams.get("metrics")).toBe("annotationClicks,cardClicks");

      return jsonResponse({
        columnHeaders: [
          { name: "annotationClicks", columnType: "METRIC", dataType: "INTEGER" },
          { name: "cardClicks", columnType: "METRIC", dataType: "INTEGER" },
        ],
        rows: [isToday ? [0, null] : [3, 4]],
      });
    });

    const rows = await collectYouTubeReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(rows[0]).toMatchObject({
      period: "today",
      views: 0,
      annotationClicks: 0,
      cardClicks: null,
      status: "ok",
    });
    expect(rows[1]).toMatchObject({
      period: "last7",
      views: 120,
      annotationClicks: 3,
      cardClicks: 4,
      status: "ok",
    });
  });

  it("keeps last7 views when optional interaction metrics have no rows", async () => {
    configureYouTube();
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.origin === "https://oauth2.googleapis.com") {
        return jsonResponse({ access_token: "short-lived-youtube-token" });
      }

      const isToday = url.searchParams.get("startDate") === "2026-08-28";
      if (url.searchParams.get("metrics") === "views") {
        return jsonResponse({
          columnHeaders: [{ name: "views" }],
          rows: isToday ? [] : [[2_100]],
        });
      }

      expect(url.searchParams.get("metrics")).toBe("annotationClicks,cardClicks");
      return jsonResponse({
        columnHeaders: [{ name: "annotationClicks" }, { name: "cardClicks" }],
        rows: [],
      });
    });

    const rows = await collectYouTubeReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(rows[0]).toMatchObject({ period: "today", views: null, status: "ok" });
    expect(rows[1]).toMatchObject({
      period: "last7",
      views: 2_100,
      annotationClicks: null,
      cardClicks: null,
      status: "ok",
      detail: expect.stringContaining("interazioni su annotazioni e schede N/D"),
    });
  });

  it("reports OAuth errors without exposing persistent credentials", async () => {
    configureYouTube();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: "invalid_grant" }, 400));

    const rows = await collectYouTubeReporting(new Date("2026-08-28T06:00:00Z"), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(rows.every((row) => row.status === "error")).toBe(true);
    expect(rows.every((row) => row.views === null && row.annotationClicks === null && row.cardClicks === null)).toBe(true);
    expect(rows.map((row) => row.detail).join(" ")).not.toContain("youtube-refresh-secret");
    expect(rows.map((row) => row.detail).join(" ")).not.toContain("youtube-secret");
  });
});

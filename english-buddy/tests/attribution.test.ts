import { describe, expect, it } from "vitest";
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from "@/lib/attribution";

const cookie = (record: Record<string, string>) =>
  `${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(record))}`;

describe("parseAttributionCookie", () => {
  it("reads a campaign arrival", () => {
    const result = parseAttributionCookie(
      cookie({ v: "11111111-2222-3333-4444-555555555555", s: "google", m: "cpc", c: "riunioni-inglese", t: "2026-09-01T08:00:00.000Z" })
    );
    expect(result).toEqual({
      visitorId: "11111111-2222-3333-4444-555555555555",
      source: "google",
      medium: "cpc",
      campaign: "riunioni-inglese",
      referrer: null,
      landedAt: "2026-09-01T08:00:00.000Z",
    });
  });

  it("finds the cookie when other cookies come first", () => {
    const header = `eb_ref=%7B%22c%22%3A%22ABC%22%7D; ${cookie({ v: "abcdefgh", s: "linkedin" })}; session=xyz`;
    expect(parseAttributionCookie(header)?.source).toBe("linkedin");
  });

  it("falls back to direct when the source is missing", () => {
    expect(parseAttributionCookie(cookie({ v: "abcdefgh" }))?.source).toBe("direct");
  });

  it("returns null when there is no cookie at all", () => {
    expect(parseAttributionCookie(null)).toBeNull();
    expect(parseAttributionCookie("session=xyz")).toBeNull();
  });

  it("survives a corrupt or hand-edited cookie", () => {
    expect(parseAttributionCookie(`${ATTRIBUTION_COOKIE}=not-json`)).toBeNull();
    expect(parseAttributionCookie(`${ATTRIBUTION_COOKIE}=${encodeURIComponent("[1,2,3]")}`)?.source).toBe("direct");
  });

  it("caps oversized fields so a crafted cookie cannot bloat the database", () => {
    const result = parseAttributionCookie(cookie({ v: "a".repeat(500), s: "b".repeat(500), c: "c".repeat(500), r: "d".repeat(500) }));
    expect(result?.visitorId).toHaveLength(64);
    expect(result?.source).toHaveLength(60);
    expect(result?.campaign).toHaveLength(80);
    expect(result?.referrer).toHaveLength(200);
  });

  it("ignores non-string values instead of trusting them", () => {
    const result = parseAttributionCookie(cookie({ v: "abcdefgh" } as Record<string, string>).replace("%7D", "%2C%22s%22%3A42%7D"));
    expect(result?.source).toBe("direct");
  });
});

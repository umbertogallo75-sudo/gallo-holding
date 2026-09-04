import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureAttribution } from "@/lib/attribution-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("first-touch attribution from ad click ids", () => {
  it("recognises TikTok without persisting the external click id", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("crypto", { randomUUID: () => "visitor-1" });
    vi.stubGlobal("window", {
      location: {
        search: "?ttclid=tiktok-secret-click-id",
        protocol: "https:",
      },
    });
    const browserDocument = { cookie: "", referrer: "" };
    vi.stubGlobal("document", browserDocument);

    expect(ensureAttribution()).toEqual({
      visitorId: "visitor-1",
      source: "tiktok",
      medium: null,
      campaign: null,
    });
    expect(browserDocument.cookie).toContain("%22s%22%3A%22tiktok%22");
    expect(browserDocument.cookie).not.toContain("tiktok-secret-click-id");
  });
});

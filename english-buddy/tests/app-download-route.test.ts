import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/app/route";
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from "@/lib/attribution";
import { CANONICAL_APP_STORE_URL } from "@/lib/store-links";

const original = {
  APP_BASE_URL: process.env.APP_BASE_URL,
  APP_STORE_URL: process.env.APP_STORE_URL,
  PLAY_STORE_URL: process.env.PLAY_STORE_URL,
};

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("smart app download redirect", () => {
  it("keeps campaign attribution on the fallback download page", () => {
    process.env.APP_BASE_URL = "https://www.execlingo.it";
    delete process.env.PLAY_STORE_URL;

    const response = GET(new Request("https://www.execlingo.it/app?utm_source=meta&utm_campaign=android", {
      headers: { "user-agent": "Mozilla/5.0 (Linux; Android 15)" },
    }));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://www.execlingo.it/scarica?utm_source=meta&utm_campaign=android",
    );
  });

  it("uses the public Play listing only when it is configured", () => {
    process.env.PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=it.execlingo.app";

    const response = GET(new Request("https://www.execlingo.it/app", {
      headers: { "user-agent": "Mozilla/5.0 (Linux; Android 15)" },
    }));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://play.google.com/store/apps/details?id=it.execlingo.app",
    );
  });

  it("passes safe campaign data to Play Install Referrer and seeds first-touch attribution", () => {
    process.env.PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=it.execlingo.app";

    const response = GET(new Request(
      "https://www.execlingo.it/app?utm_source=meta&utm_medium=paid_social&utm_campaign=android-launch&fbclid=click-1&token=private",
      {
        headers: {
          "user-agent": "Mozilla/5.0 (Linux; Android 15)",
          referer: "https://instagram.com/",
        },
      },
    ));

    const destination = new URL(response.headers.get("location") ?? "");
    expect(destination.origin + destination.pathname).toBe("https://play.google.com/store/apps/details");
    expect(destination.searchParams.get("id")).toBe("it.execlingo.app");
    expect(destination.searchParams.get("referrer")).toBe(
      "utm_source=meta&utm_medium=paid_social&utm_campaign=android-launch&fbclid=click-1",
    );
    expect(destination.href).not.toContain("token");

    const saved = parseAttributionCookie(response.headers.get("set-cookie"));
    expect(saved).toMatchObject({
      visitorId: null,
      source: "meta",
      medium: "paid_social",
      campaign: "android-launch",
      referrer: "https://instagram.com/",
    });
  });

  it("does not overwrite an existing first-touch campaign", () => {
    process.env.PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=it.execlingo.app";
    const existing = encodeURIComponent(JSON.stringify({ v: "visitor-123", s: "google", c: "first" }));

    const response = GET(new Request("https://www.execlingo.it/app?utm_source=meta", {
      headers: {
        "user-agent": "Mozilla/5.0 (Linux; Android 15)",
        cookie: `${ATTRIBUTION_COOKIE}=${existing}`,
      },
    }));

    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("falls back safely when the configured Play URL points to another package", () => {
    process.env.PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.example.other";

    const response = GET(new Request("https://www.execlingo.it/app?utm_source=google&token=private", {
      headers: { "user-agent": "Mozilla/5.0 (Linux; Android 15)" },
    }));

    expect(response.headers.get("location")).toBe(
      "https://www.execlingo.it/scarica?utm_source=google",
    );
  });

  it("sends iOS to App Store and desktop to the tracked fallback", () => {
    process.env.APP_STORE_URL = CANONICAL_APP_STORE_URL;
    process.env.PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=it.execlingo.app";

    const ios = GET(new Request("https://www.execlingo.it/app?utm_source=meta", {
      headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" },
    }));
    expect(ios.headers.get("location")).toBe(CANONICAL_APP_STORE_URL);

    const desktop = GET(new Request("https://www.execlingo.it/app?utm_source=linkedin&utm_campaign=b2b&email=private", {
      headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
    }));
    expect(desktop.headers.get("location")).toBe(
      "https://www.execlingo.it/scarica?utm_source=linkedin&utm_campaign=b2b",
    );
  });
});

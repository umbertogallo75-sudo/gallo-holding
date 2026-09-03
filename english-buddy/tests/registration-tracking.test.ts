import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APP_COOKIE } from "@/lib/appclient";
import { ATTRIBUTION_COOKIE } from "@/lib/attribution";
import { recordRegistration } from "@/lib/registration-tracking";

let dir: string;
let client: Client;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "english-buddy-registration-tracking-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

function request(headers: HeadersInit = {}) {
  return new Request("https://www.execlingo.it/api/auth/register", { headers });
}

describe("registration tracking", () => {
  it("always stores an explicit backend-derived platform", async () => {
    await recordRegistration(request(), "web-user", client);
    await recordRegistration(request({ "user-agent": "ExecLingoApp/1.0" }), "ios-user", client);
    await recordRegistration(request({ "user-agent": "ExecLingoAndroid/1.0" }), "android-user", client);
    await recordRegistration(request({ cookie: `${APP_COOKIE}=twa` }), "legacy-android-user", client);

    const result = await client.execute(
      "SELECT user_id, meta FROM analytics_events WHERE name = 'register_done' ORDER BY user_id"
    );
    const platforms = Object.fromEntries(result.rows.map((row) => [
      String(row.user_id),
      JSON.parse(String(row.meta)).platform,
    ]));

    expect(platforms).toEqual({
      "android-user": "android",
      "ios-user": "ios",
      "legacy-android-user": "android",
      "web-user": "web",
    });
    expect(result.rows.every((row) => row.meta !== null)).toBe(true);
  });

  it("preserves acquisition metadata alongside the platform", async () => {
    const attribution = encodeURIComponent(JSON.stringify({
      v: "visitor-123",
      s: "google",
      m: "cpc",
      c: "android-launch",
    }));
    await recordRegistration(
      request({
        "user-agent": "ExecLingoAndroid/2.0",
        cookie: `${ATTRIBUTION_COOKIE}=${attribution}`,
      }),
      "attributed-user",
      client,
    );

    const event = (await client.execute({
      sql: "SELECT visitor_id, meta FROM analytics_events WHERE user_id = ?",
      args: ["attributed-user"],
    })).rows[0];
    expect(event.visitor_id).toBe("visitor-123");
    expect(JSON.parse(String(event.meta))).toEqual({
      src: "google",
      medium: "cpc",
      campaign: "android-launch",
      platform: "android",
    });

    const saved = (await client.execute({
      sql: "SELECT source, medium, campaign FROM user_attribution WHERE user_id = ?",
      args: ["attributed-user"],
    })).rows[0];
    expect(saved).toMatchObject({ source: "google", medium: "cpc", campaign: "android-launch" });
  });
});

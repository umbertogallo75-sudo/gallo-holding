import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { trackEvent } from "@/lib/analytics";

let dir: string;
let client: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "english-buddy-analytics-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  const migrations = join(__dirname, "..", "db", "migrations");
  for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(join(migrations, file), "utf8"));
  }
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("funnel analytics", () => {
  it("records anonymous and user events with metadata", async () => {
    await trackEvent("landing_view", { visitorId: "visitor-1234", meta: { ref: "https://linkedin.com" } }, client);
    await trackEvent("register_done", { userId: "user-1" }, client);
    const rows = (await client.execute("SELECT name, visitor_id, user_id, meta FROM analytics_events ORDER BY name")).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("landing_view");
    expect(rows[0].visitor_id).toBe("visitor-1234");
    expect(JSON.parse(String(rows[0].meta)).ref).toContain("linkedin");
    expect(rows[1].name).toBe("register_done");
    expect(rows[1].user_id).toBe("user-1");
  });

  it("never throws when the table is unavailable", async () => {
    const broken = createClient({ url: `file:${join(dir, "empty.db")}` });
    await expect(trackEvent("landing_view", {}, broken)).resolves.toBeUndefined();
    broken.close();
  });
});

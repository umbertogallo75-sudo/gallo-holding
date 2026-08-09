import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateLicenses, redeemLicense, teamUnitAmount } from "@/lib/licenses";
import { getEntitlement } from "@/lib/stripe";

let dir: string;
let client: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "english-buddy-licenses-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  const migrations = join(__dirname, "..", "db", "migrations");
  for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(join(migrations, file), "utf8"));
  }
  await client.execute("INSERT INTO auth_users (id, display_name, email, code_hmac, created_at) VALUES ('emp', 'E', 'e@x.it', 'h9', datetime('now', '-60 days'))");
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("team pricing tiers", () => {
  it("applies 5/10/15% by volume and rejects out-of-range quantities", () => {
    expect(teamUnitAmount(9)).toBeNull();
    expect(teamUnitAmount(10)).toBe(9490);
    expect(teamUnitAmount(49)).toBe(9490);
    expect(teamUnitAmount(50)).toBe(8990);
    expect(teamUnitAmount(149)).toBe(8990);
    expect(teamUnitAmount(150)).toBe(8490);
    expect(teamUnitAmount(1001)).toBeNull();
  });
});

describe("license lifecycle", () => {
  it("generates unique codes, idempotently per order", async () => {
    const order = { orderId: "cs_test_1", companyName: "ACME SpA", buyerEmail: "hr@acme.it", quantity: 12 };
    const codes = await generateLicenses(order, client);
    expect(codes).toHaveLength(12);
    expect(new Set(codes).size).toBe(12);
    expect(codes[0]).toMatch(/^EXEC-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    // Webhook retry: same order returns the same codes, no duplicates.
    const again = await generateLicenses(order, client);
    expect(again.sort()).toEqual([...codes].sort());
  });

  it("redeem activates the program once and only once", async () => {
    const [code] = await generateLicenses({ orderId: "cs_test_2", companyName: "Beta Srl", buyerEmail: "hr@beta.it", quantity: 10 }, client);
    // Expired trial user becomes entitled through the license.
    expect((await getEntitlement("emp", client)).access).toBe(false);
    const first = await redeemLicense(code.toLowerCase(), "emp", client);
    expect(first).toMatchObject({ ok: true, companyName: "Beta Srl" });
    expect((await getEntitlement("emp", client))).toMatchObject({ access: true, reason: "plan", plan: "program" });
    const second = await redeemLicense(code, "someone-else", client);
    expect(second).toMatchObject({ ok: false, reason: "already_used" });
    expect(await redeemLicense("EXEC-ZZZZ-ZZZZ", "emp", client)).toMatchObject({ ok: false, reason: "not_found" });
  });
});

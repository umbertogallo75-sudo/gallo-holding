import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateLicenses, redeemLicense, TEAM_PLANS, teamUnitAmount, type TeamPlan } from "@/lib/licenses";
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
    // No plan argument still means the 3-month program, as it always did.
    expect(teamUnitAmount(10)).toBe(teamUnitAmount(10, "program"));
  });

  it("puts the annual package on the same ladder", () => {
    expect(teamUnitAmount(9, "annual")).toBeNull();
    expect(teamUnitAmount(10, "annual")).toBe(18900);
    expect(teamUnitAmount(49, "annual")).toBe(18900);
    expect(teamUnitAmount(50, "annual")).toBe(17900);
    expect(teamUnitAmount(149, "annual")).toBe(17900);
    expect(teamUnitAmount(150, "annual")).toBe(16900);
    expect(teamUnitAmount(1001, "annual")).toBeNull();
  });

  it("discounts every package by at least 5/10/15% and never gives away more than a rounding", () => {
    for (const plan of Object.keys(TEAM_PLANS) as TeamPlan[]) {
      const { full, tiers } = TEAM_PLANS[plan];
      tiers.forEach((tier, index) => {
        const target = [0.05, 0.1, 0.15][index];
        const applied = (full - tier) / full;
        // The published percentage is a promise: the price may round in the
        // buyer's favour, never against them, and never by a whole euro.
        expect(applied).toBeGreaterThanOrEqual(target);
        expect(applied).toBeLessThan(target + 100 / full);
      });
      // Tiers only ever go down as the order grows.
      expect(tiers[0]).toBeGreaterThan(tiers[1]);
      expect(tiers[1]).toBeGreaterThan(tiers[2]);
      expect(full).toBeGreaterThan(tiers[0]);
    }
  });

  it("keeps the buyer-facing prices in step with the server", () => {
    // CompanyForm is a client component and cannot import the pricing lib, so
    // it holds a copy. This is the guard that the copy still matches.
    const form = readFileSync(join(__dirname, "..", "src", "app", "aziende", "CompanyForm.tsx"), "utf8");
    const page = readFileSync(join(__dirname, "..", "src", "app", "aziende", "page.tsx"), "utf8");
    const money = (cents: number) => (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2 });
    for (const plan of Object.keys(TEAM_PLANS) as TeamPlan[]) {
      const { full, tiers, label } = TEAM_PLANS[plan];
      expect(form).toContain(`tiers: [${tiers.join(", ")}]`);
      expect(form).toContain(`full: ${full}`);
      expect(form).toContain(label);
      // The public table quotes the same numbers the checkout will charge.
      for (const cents of [...tiers, full]) expect(page).toContain(`${money(cents)} €`);
    }
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

  it("an annual code activates twelve months, not three", async () => {
    await client.execute("INSERT INTO auth_users (id, display_name, email, code_hmac, created_at) VALUES ('emp-year', 'Y', 'y@x.it', 'h10', datetime('now', '-60 days'))");
    const [code] = await generateLicenses(
      { orderId: "cs_test_annual", companyName: "Gamma SpA", buyerEmail: "hr@gamma.it", quantity: 10, plan: "annual" },
      client
    );
    const result = await redeemLicense(code, "emp-year", client);
    expect(result).toMatchObject({ ok: true, plan: "annual" });
    const entitlement = await getEntitlement("emp-year", client);
    expect(entitlement).toMatchObject({ access: true, reason: "plan", plan: "annual" });
    // Three months after redeeming, an annual seat is still very much alive.
    const daysLeft = (Date.parse(String(entitlement.currentPeriodEnd)) - Date.now()) / 86_400_000;
    expect(daysLeft).toBeGreaterThan(360);
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

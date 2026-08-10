import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertValidRate,
  attributeSignup,
  createPartner,
  getPartner,
  getPartnerByCode,
  MAX_COMMISSION_RATE,
  promoteHeldCommissions,
  recordCommission,
  reverseCommission,
  setPartnerRate,
} from "@/lib/partners";

let dir: string;
let client: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "english-buddy-partners-"));
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

describe("5% platform-wide commission cap", () => {
  it("accepts 0–5 and rejects everything above at every layer", async () => {
    expect(assertValidRate(0)).toBe(0);
    expect(assertValidRate(3)).toBe(3);
    expect(assertValidRate(5)).toBe(5);
    for (const bad of [5.01, 6, 10, 20, -1, NaN, Infinity]) {
      expect(() => assertValidRate(bad)).toThrow(/5%/);
    }
    expect(MAX_COMMISSION_RATE).toBe(5);
    const partner = await createPartner({ userId: "cap-p", name: "Cap", email: "cap@x.it", country: "IT", partnerType: "AFFILIATE" }, client);
    expect(partner.commissionRate).toBe(5);
    await expect(setPartnerRate("owner", "cap-p", 6, client)).rejects.toThrow(/5%/);
    await expect(setPartnerRate("owner", "cap-p", 5.01, client)).rejects.toThrow(/5%/);
    await setPartnerRate("owner", "cap-p", 2, client);
    expect((await getPartner("cap-p", client))?.commissionRate).toBe(2);
  });
});

describe("self-service partners and attribution", () => {
  it("activates instantly with code, link identity and 5% plan", async () => {
    const partner = await createPartner({ userId: "mario", name: "Mario Rossi", email: "mario@x.it", country: "IT", partnerType: "SALES_AGENT" }, client);
    expect(partner.status).toBe("ACTIVE");
    expect(partner.refCode).toMatch(/^MARIOROS-[A-Z2-9]{4}$/);
    expect((await getPartnerByCode(partner.refCode.toLowerCase(), client))?.userId).toBe("mario");
  });

  it("attributes signups by code, blocks self-referrals, honors leads", async () => {
    const partner = await getPartner("mario", client);
    expect(await attributeSignup({ userId: "cust1", email: "c1@x.it", refCode: partner!.refCode }, client)).toBe("mario");
    // Self-referral by email is never commissionable.
    expect(await attributeSignup({ userId: "cust2", email: "mario@x.it", refCode: partner!.refCode }, client)).toBeNull();
    // Offline lead: registered email converts to the agent even without a link.
    await client.execute({
      sql: "INSERT INTO partner_leads (id, partner_id, contact_name, email, source, protected_until) VALUES ('l1', 'mario', 'Lead Uno', 'lead1@x.it', 'MEETING', datetime('now', '+30 days'))",
    });
    expect(await attributeSignup({ userId: "cust3", email: "lead1@x.it" }, client)).toBe("mario");
    const lead = await client.execute("SELECT status FROM partner_leads WHERE id = 'l1'");
    expect(String(lead.rows[0].status)).toBe("converted");
    // Expired lead protection does not attribute.
    await client.execute({
      sql: "INSERT INTO partner_leads (id, partner_id, contact_name, email, source, protected_until) VALUES ('l2', 'mario', 'Lead Due', 'lead2@x.it', 'PHONE', datetime('now', '-1 day'))",
    });
    expect(await attributeSignup({ userId: "cust4", email: "lead2@x.it" }, client)).toBeNull();
  });
});

describe("commission ledger", () => {
  it("computes on net-of-VAT, is idempotent and holds for 30 days", async () => {
    // €122 gross with €22 VAT → €100 net → 5% = €5.00
    const first = await recordCommission({ userId: "cust1", paymentRef: "cs_1", paymentIntent: "pi_1", plan: "program", grossCents: 12200, taxCents: 2200 }, client);
    expect(first.recorded).toBe(true);
    expect(first.amountCents).toBe(500);
    // Webhook retry: same payment ref must not duplicate.
    const retry = await recordCommission({ userId: "cust1", paymentRef: "cs_1", grossCents: 12200, taxCents: 2200 }, client);
    expect(retry.recorded).toBe(false);
    const row = (await client.execute("SELECT status, net_cents FROM commissions WHERE payment_ref = 'cs_1'")).rows[0];
    expect(String(row.status)).toBe("pending");
    expect(Number(row.net_cents)).toBe(10000);
    // No attribution → no commission.
    expect((await recordCommission({ userId: "nobody", paymentRef: "cs_2", grossCents: 9990 }, client)).recorded).toBe(false);
  });

  it("promotes after hold and reverses on refund without deleting", async () => {
    await client.execute("UPDATE commissions SET available_at = datetime('now', '-1 hour') WHERE payment_ref = 'cs_1'");
    await promoteHeldCommissions(client);
    expect(String((await client.execute("SELECT status FROM commissions WHERE payment_ref = 'cs_1'")).rows[0].status)).toBe("available");
    expect(await reverseCommission("pi_1", "charge.refunded", client)).toBe(true);
    const reversed = (await client.execute("SELECT status, reversal_reason FROM commissions WHERE payment_ref = 'cs_1'")).rows[0];
    expect(String(reversed.status)).toBe("reversed");
    expect(String(reversed.reversal_reason)).toBe("charge.refunded");
    // Already-reversed entries stay put.
    expect(await reverseCommission("pi_1", "again", client)).toBe(false);
  });

  it("VAT fallback applies 22% when tax breakdown is missing", async () => {
    await attributeSignup({ userId: "cust5", email: "c5@x.it", refCode: (await getPartner("mario", client))!.refCode }, client);
    const result = await recordCommission({ userId: "cust5", paymentRef: "cs_3", grossCents: 9990 }, client);
    // 9990 / 1.22 = 8189 net → 5% = 409
    expect(result.amountCents).toBe(409);
  });
});

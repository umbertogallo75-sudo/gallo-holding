import { createHmac } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBilling, getEntitlement, maintenanceUnlocked, PLANS, saveBilling, userIdByCustomer, verifyStripeSignature } from "@/lib/stripe";

let dir: string;
let client: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "english-buddy-stripe-"));
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

function sign(payload: string, secret: string, timestamp: number): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

describe("stripe webhook signature", () => {
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({ type: "checkout.session.completed" });

  it("accepts a valid signature", () => {
    const now = 1_700_000_000;
    expect(verifyStripeSignature(payload, sign(payload, secret, now), secret, now)).toBe(true);
  });

  it("rejects a wrong secret, tampered payload, stale timestamp and missing header", () => {
    const now = 1_700_000_000;
    expect(verifyStripeSignature(payload, sign(payload, "whsec_other", now), secret, now)).toBe(false);
    expect(verifyStripeSignature(payload + "x", sign(payload, secret, now), secret, now)).toBe(false);
    expect(verifyStripeSignature(payload, sign(payload, secret, now - 4000), secret, now)).toBe(false);
    expect(verifyStripeSignature(payload, null, secret, now)).toBe(false);
  });
});

describe("catalogo prezzi web", () => {
  it("configura l'annuale a 199 euro con rinnovo ogni anno", () => {
    expect(PLANS.annual).toEqual({
      lookupKey: "execlingo_annual",
      name: "ExecLingo — Annuale",
      amount: 19_900,
      interval: "year",
    });
  });
});

describe("billing state and entitlement", () => {
  it("upserts billing and maps customers back to users", async () => {
    await saveBilling({ userId: "u1", stripeCustomerId: "cus_123", plan: "monthly", status: "active" }, client);
    await saveBilling({ userId: "u1", status: "past_due" }, client);
    const row = await getBilling("u1", client);
    expect(row?.status).toBe("past_due");
    expect(row?.plan).toBe("monthly");
    expect(row?.stripeCustomerId).toBe("cus_123");
    expect(await userIdByCustomer("cus_123", client)).toBe("u1");
  });

  it("owner always has access", async () => {
    expect((await getEntitlement("owner", client)).reason).toBe("owner");
  });

  it("plan or comp access unlocks; everyone else is locked (no trial)", async () => {
    await client.execute("INSERT INTO auth_users (id, display_name, email, code_hmac, created_at) VALUES ('fresh', 'F', 'f@x.it', 'h1', datetime('now'))");
    await client.execute("INSERT INTO auth_users (id, display_name, email, code_hmac, created_at) VALUES ('payer', 'P', 'p@x.it', 'h3', datetime('now', '-30 days'))");
    await saveBilling({ userId: "payer", plan: "program", status: "active", currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString() }, client);
    await saveBilling({ userId: "comp", plan: "free", status: "active" }, client);

    expect((await getEntitlement("fresh", client))).toMatchObject({ access: false, reason: "locked" });
    expect((await getEntitlement("payer", client))).toMatchObject({ access: true, reason: "plan" });
    expect((await getEntitlement("comp", client))).toMatchObject({ access: true, reason: "free" });
    await saveBilling({ userId: "comp", status: "canceled" }, client);
    expect((await getEntitlement("comp", client))).toMatchObject({ access: false, reason: "locked" });
  });

  it("maintenance unlocks only after the programme, and stays unlocked", async () => {
    await saveBilling({ userId: "solo", plan: "monthly", status: "active" }, client);
    expect(maintenanceUnlocked(await getBilling("solo", client))).toBe(false);
    expect(maintenanceUnlocked(null)).toBe(false);

    await saveBilling({ userId: "path", plan: "program", status: "active" }, client);
    expect(maintenanceUnlocked(await getBilling("path", client))).toBe(true);

    // Programme over, now on maintenance: the stamp survives the plan change.
    await saveBilling({ userId: "path", plan: "maintenance", status: "active" }, client);
    const after = await getBilling("path", client);
    expect(after?.plan).toBe("maintenance");
    expect(after?.programAt).toBeTruthy();
    expect(maintenanceUnlocked(after)).toBe(true);
  });
});

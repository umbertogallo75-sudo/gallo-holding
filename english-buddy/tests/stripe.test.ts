import { createHmac } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBilling, getEntitlement, saveBilling, userIdByCustomer, verifyStripeSignature } from "@/lib/stripe";

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

  it("active plan grants access; fresh users get a trial; old users without plan expire", async () => {
    await client.execute("INSERT INTO auth_users (id, display_name, email, code_hmac, created_at) VALUES ('fresh', 'F', 'f@x.it', 'h1', datetime('now'))");
    await client.execute("INSERT INTO auth_users (id, display_name, email, code_hmac, created_at) VALUES ('old', 'O', 'o@x.it', 'h2', datetime('now', '-30 days'))");
    await client.execute("INSERT INTO auth_users (id, display_name, email, code_hmac, created_at) VALUES ('payer', 'P', 'p@x.it', 'h3', datetime('now', '-30 days'))");
    await saveBilling({ userId: "payer", plan: "program", status: "active", currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString() }, client);

    expect((await getEntitlement("fresh", client))).toMatchObject({ access: true, reason: "trial" });
    expect((await getEntitlement("old", client))).toMatchObject({ access: false, reason: "expired" });
    expect((await getEntitlement("payer", client))).toMatchObject({ access: true, reason: "plan" });
  });
});

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET = "test-secret-that-is-definitely-32-characters-long";

import { applyGooglePurchase, GOOGLE_PRODUCTS, periodEndFor, PROGRAM_DAYS, playStoreConfigured, type GooglePurchase } from "@/lib/playstore";
import { getEntitlement } from "@/lib/stripe";

let dir: string;
let client: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "english-buddy-playstore-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  const migrations = join(__dirname, "..", "db", "migrations");
  for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(join(migrations, file), "utf8"));
  }
  await client.execute({
    sql: "INSERT INTO auth_users (id, display_name, code_hmac, email) VALUES (?, ?, ?, ?)",
    args: ["buyer-1", "Buyer", "hash-b1", "buyer@azienda.it"],
  });
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("Google Play purchases", () => {
  it("is unconfigured without service-account env", () => {
    expect(playStoreConfigured()).toBe(false);
  });

  it("maps the three products to billing plans", () => {
    expect(GOOGLE_PRODUCTS.monthly).toEqual({ plan: "monthly", kind: "subscription" });
    expect(GOOGLE_PRODUCTS.maintenance).toEqual({ plan: "maintenance", kind: "subscription" });
    expect(GOOGLE_PRODUCTS.program).toEqual({ plan: "program", kind: "one-time" });
  });

  it("computes the program period end from the purchase time", () => {
    const bought = Date.parse("2026-08-12T10:00:00Z");
    const purchase: GooglePurchase = { productId: "program", purchaseTimeMillis: bought, active: true, needsAck: false };
    expect(periodEndFor(purchase)).toBe(new Date(bought + PROGRAM_DAYS * 86_400_000).toISOString());
  });

  it("uses Google's expiry for subscriptions", () => {
    const expiry = Date.parse("2026-09-12T10:00:00Z");
    const purchase: GooglePurchase = { productId: "monthly", expiryTimeMillis: expiry, active: true, needsAck: false };
    expect(periodEndFor(purchase)).toBe(new Date(expiry).toISOString());
  });

  it("activates the plan for a verified purchase and unlocks the account", async () => {
    const expiry = Date.now() + 30 * 86_400_000;
    const purchase: GooglePurchase = { productId: "monthly", expiryTimeMillis: expiry, active: true, needsAck: true };
    const result = await applyGooglePurchase(purchase, "token-abc", "buyer-1", client);
    expect(result).toEqual({ ok: true, plan: "monthly" });
    const entitlement = await getEntitlement("buyer-1", client);
    expect(entitlement.access).toBe(true);
    expect(entitlement.reason).toBe("plan");
  });

  it("maps renewals back to the user through the stored token", async () => {
    const laterExpiry = Date.now() + 60 * 86_400_000;
    const renewal: GooglePurchase = { productId: "monthly", expiryTimeMillis: laterExpiry, active: true, needsAck: false };
    const result = await applyGooglePurchase(renewal, "token-abc", null, client);
    expect(result).toEqual({ ok: true, plan: "monthly" });
  });

  it("cancels access when the purchase is no longer active", async () => {
    const purchase: GooglePurchase = { productId: "monthly", active: false, needsAck: false };
    const result = await applyGooglePurchase(purchase, "token-abc", null, client);
    expect(result.ok).toBe(true);
    const entitlement = await getEntitlement("buyer-1", client);
    expect(entitlement.access).toBe(false);
  });

  it("rejects unknown products", async () => {
    const purchase: GooglePurchase = { productId: "mystery", active: true, needsAck: false };
    const result = await applyGooglePurchase(purchase, "token-x", "buyer-1", client);
    expect(result).toEqual({ ok: false, error: "product" });
  });
});

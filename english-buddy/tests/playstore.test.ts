import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET = "test-secret-that-is-definitely-32-characters-long";

import { applyGooglePurchase, GOOGLE_PRODUCTS, periodEndFor, PROGRAM_DAYS, playAccountHint, playObfuscatedAccountId, playStoreConfigured, type GooglePurchase } from "@/lib/playstore";
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

  it("fails closed unless the dedicated account-binding secret is at least 32 characters", () => {
    expect(playAccountHint("buyer-1", "")).toBeNull();
    expect(playAccountHint("buyer-1", "short-secret")).toBeNull();
    expect(playAccountHint("buyer-1", "                                ")).toBeNull();
    expect(playObfuscatedAccountId("buyer-1", "short-secret")).toBeNull();

    const secret = "stable-play-binding-secret-32-characters";
    expect(playAccountHint("buyer-1", `  ${secret}  `)).toBe(playAccountHint("buyer-1", secret));
    expect(playObfuscatedAccountId("buyer-1", secret)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("maps every product to billing plans", () => {
    expect(GOOGLE_PRODUCTS.monthly).toEqual({ plan: "monthly", kind: "subscription" });
    expect(GOOGLE_PRODUCTS.annual).toEqual({ plan: "annual", kind: "subscription" });
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

  it("uses Google's expiry for the annual subscription", () => {
    const expiry = Date.parse("2027-08-12T10:00:00Z");
    const purchase: GooglePurchase = { productId: "annual", expiryTimeMillis: expiry, active: true, needsAck: false };
    expect(periodEndFor(purchase)).toBe(new Date(expiry).toISOString());
  });

  it("activates the plan for a verified purchase and unlocks the account", async () => {
    const expiry = Date.now() + 30 * 86_400_000;
    const purchase: GooglePurchase = { productId: "monthly", expiryTimeMillis: expiry, active: true, needsAck: true };
    const result = await applyGooglePurchase(purchase, "token-abc", "buyer-1", client);
    expect(result).toEqual({ ok: true, plan: "monthly", newlyRecorded: true });
    const entitlement = await getEntitlement("buyer-1", client);
    expect(entitlement.access).toBe(true);
    expect(entitlement.reason).toBe("plan");
  });

  it("maps renewals back to the user through the stored token", async () => {
    const laterExpiry = Date.now() + 60 * 86_400_000;
    const renewal: GooglePurchase = { productId: "monthly", expiryTimeMillis: laterExpiry, active: true, needsAck: false };
    const result = await applyGooglePurchase(renewal, "token-abc", null, client);
    expect(result).toEqual({ ok: true, plan: "monthly", newlyRecorded: false });
  });

  it("rejects replaying the same Google purchase token on a second account", async () => {
    const purchase: GooglePurchase = {
      productId: "annual",
      expiryTimeMillis: Date.now() + 365 * 86_400_000,
      active: true,
      needsAck: false,
    };

    await expect(applyGooglePurchase(purchase, "token-owned-by-one-account", "google-owner", client))
      .resolves.toEqual({ ok: true, plan: "annual", newlyRecorded: true });
    await expect(applyGooglePurchase(purchase, "token-owned-by-one-account", "google-attacker", client))
      .resolves.toEqual({ ok: false, error: "owner" });

    const owner = (await client.execute({
      sql: "SELECT user_id FROM store_purchase_owners WHERE provider = 'google' AND purchase_key = ?",
      args: ["token-owned-by-one-account"],
    })).rows[0]?.user_id;
    expect(owner).toBe("google-owner");
    expect(await getEntitlement("google-attacker", client)).toMatchObject({ access: false });
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

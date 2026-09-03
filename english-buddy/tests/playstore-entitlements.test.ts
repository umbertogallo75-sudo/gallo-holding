import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyGooglePurchase, type GooglePurchase } from "@/lib/playstore";
import { getEntitlement, saveBilling } from "@/lib/stripe";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-03T12:00:00Z");
const USER_ID = "play-entitlement-owner";
const ANNUAL_TOKEN = "test-annual-token";
const MONTHLY_TOKEN = "test-other-monthly-token";
const PROGRAM_TOKEN = "test-historical-program-token";

let client: Client;
let directory: string;

function subscription(productId: "annual" | "monthly", daysRemaining: number, active = true): GooglePurchase {
  return { productId, expiryTimeMillis: NOW + daysRemaining * DAY, active, needsAck: false };
}

async function apply(purchase: GooglePurchase, token: string, userId: string | null = USER_ID) {
  const result = await applyGooglePurchase(purchase, token, userId, client);
  expect(result).toMatchObject({ ok: true });
}

beforeEach(async () => {
  // Only mock the clock; keep the database's asynchronous execution real.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubGlobal("fetch", vi.fn(() => {
    throw new Error("These entitlement regression tests must never call an external API");
  }));

  // libSQL's :memory: database is lost when its transaction connection closes.
  // A unique file database exercises real transaction commits without touching production.
  directory = mkdtempSync(join(tmpdir(), "execlingo-play-entitlements-"));
  client = createClient({ url: `file:${join(directory, "test.db")}` });
  const migrations = join(__dirname, "..", "db", "migrations");
  for (const file of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(join(migrations, file), "utf8"));
  }
  await client.execute({
    sql: "INSERT INTO auth_users (id, display_name, code_hmac, email) VALUES (?, ?, ?, ?)",
    args: [USER_ID, "Entitlement Test", "unused-test-hash", "entitlement-test@example.invalid"],
  });
});

afterEach(() => {
  client?.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Google Play entitlement reconciliation across purchase tokens", () => {
  it("preserves an active annual subscription when a historical expired program is restored", async () => {
    const historicalProgram: GooglePurchase = {
      productId: "program",
      purchaseTimeMillis: NOW - 200 * DAY,
      active: true,
      needsAck: false,
    };
    await apply(historicalProgram, PROGRAM_TOKEN);
    await apply(subscription("annual", 365), ANNUAL_TOKEN);

    // Resolve the restored purchase through its durable owner, not the current billing token.
    await apply(historicalProgram, PROGRAM_TOKEN, null);

    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: true, reason: "plan", plan: "annual" });
  });

  it("preserves an active annual subscription when a different inactive monthly purchase is restored", async () => {
    const inactiveMonthly = subscription("monthly", -30, false);
    await apply(inactiveMonthly, MONTHLY_TOKEN);
    await apply(subscription("annual", 365), ANNUAL_TOKEN);

    await apply(inactiveMonthly, MONTHLY_TOKEN, null);

    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: true, reason: "plan", plan: "annual" });
  });

  it("does not shorten annual coverage when a different active monthly purchase expires sooner", async () => {
    await apply(subscription("annual", 365), ANNUAL_TOKEN);
    await apply(subscription("monthly", 30), MONTHLY_TOKEN);

    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: true, reason: "plan" });
    vi.setSystemTime(NOW + 60 * DAY);

    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: true, reason: "plan", plan: "annual" });
  });

  it.each([
    { state: "revoked", purchase: subscription("annual", 365, false) },
    // Expiry is beyond the existing three-day grace period.
    { state: "expired", purchase: subscription("annual", -4) },
  ])("removes access when the current annual token is $state and no other valid purchase exists", async ({ purchase }) => {
    await apply(subscription("annual", 365), ANNUAL_TOKEN);
    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: true, reason: "plan", plan: "annual" });

    await apply(purchase, ANNUAL_TOKEN, null);

    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: false, reason: "locked" });
  });

  it("falls back to the still-valid monthly purchase when the current annual token is revoked", async () => {
    await apply(subscription("monthly", 30), MONTHLY_TOKEN);
    await apply(subscription("annual", 365), ANNUAL_TOKEN);
    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: true, reason: "plan", plan: "annual" });

    await apply(subscription("annual", 365, false), ANNUAL_TOKEN, null);

    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: true, reason: "plan", plan: "monthly" });
  });

  it.each([
    { product: "program", token: PROGRAM_TOKEN, purchase: {
      productId: "program", purchaseTimeMillis: NOW - 200 * DAY, active: true, needsAck: false,
    } satisfies GooglePurchase },
    { product: "inactive monthly", token: MONTHLY_TOKEN, purchase: subscription("monthly", -30, false) },
  ])("preserves legacy annual billing without a ledger when an old $product token is applied", async ({ token, purchase }) => {
    await saveBilling({
      userId: USER_ID,
      stripeCustomerId: `google:${ANNUAL_TOKEN}`,
      plan: "annual",
      status: "active",
      currentPeriodEnd: new Date(NOW + 365 * DAY).toISOString(),
    }, client);
    expect((await client.execute("SELECT COUNT(*) AS total FROM google_purchase_entitlements")).rows[0].total).toBe(0);

    await apply(purchase, token);

    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: true, reason: "plan", plan: "annual" });
    const preserved = (await client.execute({
      sql: "SELECT user_id, status, current_period_end FROM google_purchase_entitlements WHERE purchase_key = ?",
      args: [ANNUAL_TOKEN],
    })).rows[0];
    expect(preserved).toMatchObject({
      user_id: USER_ID, status: "active", current_period_end: new Date(NOW + 365 * DAY).toISOString(),
    });
  });

  it.each([
    { verification: "older", startedAt: NOW - 500 },
    { verification: "same-time", startedAt: NOW },
  ])("does not resurrect a revoked token when an $verification active verification arrives later", async ({ startedAt }) => {
    await apply({ ...subscription("annual", 365), verificationStartedAt: NOW - 1_000 }, ANNUAL_TOKEN);
    await apply({ ...subscription("annual", 365, false), verificationStartedAt: NOW }, ANNUAL_TOKEN, null);
    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: false, reason: "locked" });

    const stale = await applyGooglePurchase({
      ...subscription("annual", 365), verificationStartedAt: startedAt,
    }, ANNUAL_TOKEN, null, client);

    expect(stale).toMatchObject({ ok: true, stale: true });
    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: false, reason: "locked" });
    expect((await client.execute({
      sql: "SELECT status, verified_at FROM google_purchase_entitlements WHERE purchase_key = ?",
      args: [ANNUAL_TOKEN],
    })).rows[0]).toMatchObject({ status: "canceled", verified_at: NOW });
  });

  it("accepts a newer authoritative reactivation after a previous revocation", async () => {
    await apply({ ...subscription("annual", 365), verificationStartedAt: NOW - 1_000 }, ANNUAL_TOKEN);
    await apply({ ...subscription("annual", 365, false), verificationStartedAt: NOW - 500 }, ANNUAL_TOKEN, null);

    await apply({ ...subscription("annual", 365), verificationStartedAt: NOW }, ANNUAL_TOKEN, null);

    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: true, reason: "plan", plan: "annual" });
  });

  it.each([
    { provider: "Stripe", customerId: "cus_existing_customer", plan: "monthly", reason: "plan" },
    { provider: "Apple", customerId: "apple:existing-original-transaction", plan: "monthly", reason: "plan" },
    { provider: "free grant", customerId: null, plan: "free", reason: "free" },
    { provider: "free grant on legacy Google billing", customerId: "google:legacy-free-token", plan: "free", reason: "free" },
  ])("preserves the raw $provider billing row while applying and revoking Google purchases", async ({ customerId, plan, reason }) => {
    await saveBilling({
      userId: USER_ID,
      stripeCustomerId: customerId,
      plan,
      status: "active",
      currentPeriodEnd: plan === "free" ? null : new Date(NOW + 90 * DAY).toISOString(),
    }, client);
    const before = (await client.execute({ sql: "SELECT * FROM billing WHERE user_id = ?", args: [USER_ID] })).rows[0];

    await apply(subscription("annual", 365), ANNUAL_TOKEN);
    expect((await client.execute({ sql: "SELECT * FROM billing WHERE user_id = ?", args: [USER_ID] })).rows[0]).toEqual(before);
    await apply(subscription("annual", 365, false), ANNUAL_TOKEN, null);

    expect((await client.execute({ sql: "SELECT * FROM billing WHERE user_id = ?", args: [USER_ID] })).rows[0]).toEqual(before);
    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: true, reason, plan });
  });

  it("does not invent a fresh 98-day entitlement for a program without its purchase date", async () => {
    const result = await applyGooglePurchase({
      productId: "program", active: true, needsAck: false,
    }, PROGRAM_TOKEN, USER_ID, client);

    expect(result).toMatchObject({ ok: false, error: "expiry" });
    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: false, reason: "locked" });
    expect((await client.execute("SELECT COUNT(*) AS total FROM google_purchase_entitlements")).rows[0].total).toBe(0);
    expect((await client.execute("SELECT COUNT(*) AS total FROM store_purchase_owners")).rows[0].total).toBe(0);
  });
});

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const googleAuth = vi.hoisted(() => ({
  configured: vi.fn(),
  accessToken: vi.fn(),
}));

// No credentials, OAuth exchange or real Google API request is permitted here.
vi.mock("@/lib/google-auth", () => ({
  serviceAccountConfigured: googleAuth.configured,
  googleAccessToken: googleAuth.accessToken,
  SCOPE_ANDROID_PUBLISHER: "https://www.googleapis.com/auth/androidpublisher",
}));

import { applyGooglePurchase, refreshGoogleSubscriptions } from "@/lib/playstore";
import { getEntitlement } from "@/lib/stripe";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.parse("2026-09-03T12:00:00Z");
const USER_ID = "play-refresh-test-user";
const ANNUAL_TOKEN = "refresh-test-annual-token";
const MONTHLY_TOKEN = "refresh-test-monthly-token";
const fetchMock = vi.fn<typeof fetch>();

let directory: string;
let client: Client;

async function seedSubscription(
  token: string,
  productId: "annual" | "monthly" | "maintenance",
  expiryTimeMillis: number,
  active = true,
) {
  expect(await applyGooglePurchase({
    productId,
    expiryTimeMillis,
    active,
    needsAck: false,
    verificationStartedAt: NOW - 60_000,
  }, token, USER_ID, client)).toMatchObject({ ok: true });
}

function subscriptionResponse(productId: string, expiryTimeMillis: number, active = true): Response {
  return Response.json({
    subscriptionState: active ? "SUBSCRIPTION_STATE_ACTIVE" : "SUBSCRIPTION_STATE_EXPIRED",
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    lineItems: [{ productId, expiryTime: new Date(expiryTimeMillis).toISOString() }],
  });
}

async function billingSnapshot() {
  return (await client.execute({
    sql: "SELECT * FROM billing WHERE user_id = ?",
    args: [USER_ID],
  })).rows;
}

async function ledgerSnapshot() {
  return (await client.execute({
    sql: "SELECT * FROM google_purchase_entitlements WHERE user_id = ? ORDER BY purchase_key",
    args: [USER_ID],
  })).rows;
}

beforeEach(async () => {
  // Fake only Date; file-backed libSQL transactions keep their real async I/O.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  googleAuth.configured.mockReset().mockReturnValue(true);
  googleAuth.accessToken.mockReset().mockResolvedValue("mock-google-access-token");
  fetchMock.mockReset().mockImplementation(async () => {
    throw new Error("Unexpected fetch: every Google response must be mocked by the test");
  });
  vi.stubGlobal("fetch", fetchMock);

  directory = mkdtempSync(join(tmpdir(), "execlingo-play-refresh-test-"));
  client = createClient({ url: `file:${join(directory, "test.db")}` });
  const migrations = join(__dirname, "..", "db", "migrations");
  for (const file of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(join(migrations, file), "utf8"));
  }
  await client.execute({
    sql: "INSERT INTO auth_users (id, display_name, code_hmac, email) VALUES (?, ?, ?, ?)",
    args: [USER_ID, "Refresh Test", "unused-refresh-test-hash", "play-refresh@example.invalid"],
  });
});

afterEach(() => {
  client?.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Google Play subscription refresh", () => {
  it.each([
    { state: "renewed", active: true, expiry: NOW + 30 * DAY, refreshed: 1, lapsed: 0 },
    { state: "expired", active: false, expiry: NOW - 4 * DAY, refreshed: 0, lapsed: 1 },
  ])("updates a $state secondary token without replacing the valid annual entitlement", async ({ active, expiry, refreshed, lapsed }) => {
    await seedSubscription(ANNUAL_TOKEN, "annual", NOW + 365 * DAY);
    await seedSubscription(MONTHLY_TOKEN, "monthly", NOW + HOUR);
    expect((await billingSnapshot())[0]?.stripe_customer_id).toBe(`google:${ANNUAL_TOKEN}`);
    fetchMock.mockResolvedValueOnce(subscriptionResponse("monthly", expiry, active));

    expect(await refreshGoogleSubscriptions(client, new Date(NOW))).toEqual({ refreshed, lapsed });

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(`/purchases/subscriptionsv2/tokens/${MONTHLY_TOKEN}`),
      { headers: { Authorization: "Bearer mock-google-access-token" } },
    );
    expect((await ledgerSnapshot()).find((row) => row.purchase_key === MONTHLY_TOKEN)).toMatchObject({
      status: active ? "active" : "canceled",
      current_period_end: new Date(expiry).toISOString(),
      verified_at: NOW,
    });
    expect((await billingSnapshot())[0]).toMatchObject({
      stripe_customer_id: `google:${ANNUAL_TOKEN}`,
      plan: "annual",
      status: "active",
      current_period_end: new Date(NOW + 365 * DAY).toISOString(),
    });
    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: true, plan: "annual" });
  });

  it.each(["monthly", "annual", "maintenance"] as const)("recovers a recently expired inactive %s subscription when Google reports it active", async (productId) => {
    await seedSubscription(MONTHLY_TOKEN, productId, NOW - 5 * DAY, false);
    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: false });
    fetchMock.mockResolvedValueOnce(subscriptionResponse(productId, NOW + 30 * DAY));

    expect(await refreshGoogleSubscriptions(client, new Date(NOW))).toEqual({ refreshed: 1, lapsed: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await ledgerSnapshot())[0]).toMatchObject({ status: "active", verified_at: NOW });
    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: true, plan: productId });
  });

  it.each([401, 403, 429, 500])("does not revoke or overwrite stored access after Google HTTP %s", async (status) => {
    await seedSubscription(MONTHLY_TOKEN, "monthly", NOW + HOUR);
    const billingBefore = await billingSnapshot();
    const ledgerBefore = await ledgerSnapshot();
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Simulated API failure" }, { status }));

    expect(await refreshGoogleSubscriptions(client, new Date(NOW))).toEqual({ refreshed: 0, lapsed: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await billingSnapshot()).toEqual(billingBefore);
    expect(await ledgerSnapshot()).toEqual(ledgerBefore);
    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: true, plan: "monthly" });
  });

  it("does not treat an unreadable Google response as a verified revocation", async () => {
    await seedSubscription(MONTHLY_TOKEN, "monthly", NOW + HOUR);
    const billingBefore = await billingSnapshot();
    const ledgerBefore = await ledgerSnapshot();
    fetchMock.mockResolvedValueOnce(new Response("not valid JSON", { status: 200 }));

    expect(await refreshGoogleSubscriptions(client, new Date(NOW))).toEqual({ refreshed: 0, lapsed: 0 });

    expect(await billingSnapshot()).toEqual(billingBefore);
    expect(await ledgerSnapshot()).toEqual(ledgerBefore);
  });

  it("leaves stored access unchanged when no OAuth token is available", async () => {
    await seedSubscription(MONTHLY_TOKEN, "monthly", NOW + HOUR);
    const billingBefore = await billingSnapshot();
    const ledgerBefore = await ledgerSnapshot();
    googleAuth.accessToken.mockResolvedValue(null);

    expect(await refreshGoogleSubscriptions(client, new Date(NOW))).toEqual({ refreshed: 0, lapsed: 0 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await billingSnapshot()).toEqual(billingBefore);
    expect(await ledgerSnapshot()).toEqual(ledgerBefore);
  });

  it("continues to the next token after a network failure without revoking the failed token", async () => {
    const failedToken = "refresh-network-01";
    const renewedToken = "refresh-network-02";
    await seedSubscription(failedToken, "monthly", NOW + HOUR);
    await seedSubscription(renewedToken, "monthly", NOW + HOUR);
    const failedBefore = (await ledgerSnapshot()).find((row) => row.purchase_key === failedToken);
    fetchMock
      .mockRejectedValueOnce(new TypeError("Simulated network failure"))
      .mockResolvedValueOnce(subscriptionResponse("monthly", NOW + 30 * DAY));

    expect(await refreshGoogleSubscriptions(client, new Date(NOW))).toEqual({ refreshed: 1, lapsed: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain(`/tokens/${failedToken}`);
    expect(fetchMock.mock.calls[1][0]).toContain(`/tokens/${renewedToken}`);
    const ledgerAfter = await ledgerSnapshot();
    expect(ledgerAfter.find((row) => row.purchase_key === failedToken)).toEqual(failedBefore);
    expect(ledgerAfter.find((row) => row.purchase_key === renewedToken)).toMatchObject({
      status: "active", current_period_end: new Date(NOW + 30 * DAY).toISOString(), verified_at: NOW,
    });
    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: true, plan: "monthly" });
  });

  it("does not starve the 26th token across two refresh batches when the first 25 return HTTP 404", async () => {
    const tokens = Array.from({ length: 26 }, (_, index) => `refresh-batch-${String(index + 1).padStart(2, "0")}`);
    for (const token of tokens) await seedSubscription(token, "monthly", NOW + HOUR);
    const validToken = tokens[25];
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith(`/tokens/${validToken}`)) return subscriptionResponse("monthly", NOW + 30 * DAY);
      if (tokens.some((token) => url.endsWith(`/tokens/${token}`))) {
        return Response.json({ error: "Simulated missing subscription" }, { status: 404 });
      }
      throw new Error("Unexpected API URL in refresh fairness test");
    });

    expect(await refreshGoogleSubscriptions(client, new Date(NOW))).toEqual({ refreshed: 0, lapsed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(25);
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith(`/tokens/${validToken}`))).toBe(false);

    vi.setSystemTime(NOW + 60_000);
    expect(await refreshGoogleSubscriptions(client, new Date(NOW + 60_000))).toEqual({ refreshed: 1, lapsed: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(50);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith(`/tokens/${validToken}`))).toHaveLength(1);
    expect((await ledgerSnapshot()).find((row) => row.purchase_key === validToken)).toMatchObject({
      status: "active", current_period_end: new Date(NOW + 30 * DAY).toISOString(), verified_at: NOW + 60_000,
    });
    expect((await billingSnapshot())[0]?.stripe_customer_id).toBe(`google:${validToken}`);
  });

  it("refreshes a legacy Google billing row with no ledger entry and records its verified ownership", async () => {
    await client.execute({
      sql: `INSERT INTO billing (user_id, stripe_customer_id, plan, status, current_period_end)
            VALUES (?, ?, 'monthly', 'active', ?)`,
      args: [USER_ID, `google:${MONTHLY_TOKEN}`, new Date(NOW + HOUR).toISOString()],
    });
    expect(await ledgerSnapshot()).toEqual([]);
    fetchMock.mockResolvedValueOnce(subscriptionResponse("monthly", NOW + 30 * DAY));

    expect(await refreshGoogleSubscriptions(client, new Date(NOW))).toEqual({ refreshed: 1, lapsed: 0 });

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(`/purchases/subscriptionsv2/tokens/${MONTHLY_TOKEN}`),
      { headers: { Authorization: "Bearer mock-google-access-token" } },
    );
    expect(await ledgerSnapshot()).toMatchObject([{
      purchase_key: MONTHLY_TOKEN,
      user_id: USER_ID,
      plan: "monthly",
      status: "active",
      current_period_end: new Date(NOW + 30 * DAY).toISOString(),
      verified_at: NOW,
    }]);
    const owner = (await client.execute({
      sql: "SELECT user_id FROM store_purchase_owners WHERE provider = 'google' AND purchase_key = ?",
      args: [MONTHLY_TOKEN],
    })).rows[0];
    expect(owner?.user_id).toBe(USER_ID);
    expect(await getEntitlement(USER_ID, client)).toMatchObject({ access: true, plan: "monthly" });
  });
});

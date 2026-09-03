import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  appStoreConfigured: vi.fn(),
  decodeJwsPayload: vi.fn(),
  fetchTransaction: vi.fn(),
  applyAppleTransaction: vi.fn(),
  getBilling: vi.fn(),
  maintenanceUnlocked: vi.fn(),
  trackEventOnce: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getUserId: mocks.getUserId }));
vi.mock("@/lib/appstore", () => ({
  APPLE_PRODUCTS: {
    "it.execlingo.app.monthly": { plan: "monthly", kind: "subscription" },
    "it.execlingo.app.annual": { plan: "annual", kind: "subscription" },
    "it.execlingo.app.maintenance": { plan: "maintenance", kind: "subscription" },
    "it.execlingo.app.program": { plan: "program", kind: "non-renewing" },
  },
  appStoreConfigured: mocks.appStoreConfigured,
  decodeJwsPayload: mocks.decodeJwsPayload,
  fetchTransaction: mocks.fetchTransaction,
  applyAppleTransaction: mocks.applyAppleTransaction,
}));
vi.mock("@/lib/stripe", () => ({
  getBilling: mocks.getBilling,
  maintenanceUnlocked: mocks.maintenanceUnlocked,
}));
vi.mock("@/lib/analytics", () => ({ trackEventOnce: mocks.trackEventOnce }));
vi.mock("@/lib/rate-limit", () => ({
  clientKey: vi.fn(() => "test"),
  rateLimit: mocks.rateLimit,
}));

import { POST } from "@/app/api/appstore/confirm/route";

function request(transactionId = "apple-transaction-1") {
  return new Request("https://www.execlingo.it/api/appstore/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactionId }),
  });
}

describe("App Store purchase confirmation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserId.mockResolvedValue("buyer-apple-1");
    mocks.appStoreConfigured.mockReturnValue(true);
    mocks.rateLimit.mockReturnValue({ allowed: true });
    mocks.fetchTransaction.mockResolvedValue({
      transactionId: "apple-transaction-1",
      originalTransactionId: "apple-original-1",
      productId: "it.execlingo.app.monthly",
      bundleId: "it.execlingo.app",
    });
    mocks.applyAppleTransaction.mockResolvedValue({ ok: true, plan: "monthly", newlyRecorded: true });
    mocks.getBilling.mockResolvedValue(null);
    mocks.maintenanceUnlocked.mockReturnValue(true);
    mocks.trackEventOnce.mockResolvedValue(true);
  });

  it("fetches the authoritative Apple transaction, applies it and records the purchase", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, plan: "monthly" });
    expect(mocks.fetchTransaction).toHaveBeenCalledWith("apple-transaction-1");
    expect(mocks.applyAppleTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: "apple-transaction-1", productId: "it.execlingo.app.monthly" }),
      "buyer-apple-1",
    );
    expect(mocks.trackEventOnce).toHaveBeenCalledWith(
      "purchase_apple",
      "apple:apple-original-1",
      { userId: "buyer-apple-1", meta: { plan: "monthly" } },
    );
  });

  it("blocks maintenance when the account never purchased the programme", async () => {
    mocks.fetchTransaction.mockResolvedValue({
      transactionId: "apple-maintenance-1",
      originalTransactionId: "apple-maintenance-original-1",
      productId: "it.execlingo.app.maintenance",
      bundleId: "it.execlingo.app",
    });
    mocks.maintenanceUnlocked.mockReturnValue(false);

    const response = await POST(request("apple-maintenance-1"));

    expect(response.status).toBe(403);
    expect(mocks.getBilling).toHaveBeenCalledWith("buyer-apple-1");
    expect(mocks.applyAppleTransaction).not.toHaveBeenCalled();
    expect(mocks.trackEventOnce).not.toHaveBeenCalled();
  });

  it("retries the same idempotent conversion when a transaction is restored", async () => {
    mocks.applyAppleTransaction.mockResolvedValue({ ok: true, plan: "monthly", newlyRecorded: false });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.trackEventOnce).toHaveBeenCalledWith(
      "purchase_apple",
      "apple:apple-original-1",
      { userId: "buyer-apple-1", meta: { plan: "monthly" } },
    );
  });

  it("asks the native bridge to retry when durable conversion storage is unavailable", async () => {
    mocks.trackEventOnce.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ recorded: true, trackingPending: true, plan: "monthly" });
  });

  it("allows maintenance after the programme entitlement is established", async () => {
    const maintenanceTransaction = {
      transactionId: "apple-maintenance-2",
      originalTransactionId: "apple-maintenance-original-2",
      productId: "it.execlingo.app.maintenance",
      bundleId: "it.execlingo.app",
    };
    mocks.fetchTransaction.mockResolvedValue(maintenanceTransaction);
    mocks.applyAppleTransaction.mockResolvedValue({ ok: true, plan: "maintenance", newlyRecorded: true });

    const response = await POST(request("apple-maintenance-2"));

    expect(response.status).toBe(200);
    expect(mocks.getBilling).toHaveBeenCalledWith("buyer-apple-1");
    expect(mocks.applyAppleTransaction).toHaveBeenCalledWith(maintenanceTransaction, "buyer-apple-1");
    expect(mocks.trackEventOnce).toHaveBeenCalledWith(
      "purchase_apple",
      "apple:apple-maintenance-original-2",
      { userId: "buyer-apple-1", meta: { plan: "maintenance" } },
    );
  });
});

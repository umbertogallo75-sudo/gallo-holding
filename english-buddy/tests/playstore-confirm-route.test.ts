import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  playStoreConfigured: vi.fn(),
  fetchPurchase: vi.fn(),
  acknowledgePurchase: vi.fn(),
  applyGooglePurchase: vi.fn(),
  playObfuscatedAccountId: vi.fn(),
  getBilling: vi.fn(),
  maintenanceUnlocked: vi.fn(),
  trackEventOnce: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getUserId: mocks.getUserId }));
vi.mock("@/lib/playstore", () => ({
  GOOGLE_PRODUCTS: {
    monthly: { plan: "monthly", kind: "subscription" },
    annual: { plan: "annual", kind: "subscription" },
    maintenance: { plan: "maintenance", kind: "subscription" },
    program: { plan: "program", kind: "one-time" },
  },
  playStoreConfigured: mocks.playStoreConfigured,
  fetchPurchase: mocks.fetchPurchase,
  acknowledgePurchase: mocks.acknowledgePurchase,
  applyGooglePurchase: mocks.applyGooglePurchase,
  playObfuscatedAccountId: mocks.playObfuscatedAccountId,
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

import { POST } from "@/app/api/playstore/confirm/route";

function request(productId = "monthly") {
  return new Request("https://www.execlingo.it/api/playstore/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, purchaseToken: "purchase-token-long-enough" }),
  });
}

describe("Google Play purchase confirmation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserId.mockResolvedValue("buyer-1");
    mocks.playStoreConfigured.mockReturnValue(true);
    mocks.rateLimit.mockReturnValue({ allowed: true });
    mocks.playObfuscatedAccountId.mockReturnValue("account-binding-buyer-1");
    mocks.getBilling.mockResolvedValue(null);
    mocks.maintenanceUnlocked.mockReturnValue(true);
    mocks.fetchPurchase.mockResolvedValue({
      productId: "monthly",
      active: true,
      needsAck: true,
      expiryTimeMillis: Date.now() + 30 * 86_400_000,
      obfuscatedAccountId: "account-binding-buyer-1",
    });
    mocks.acknowledgePurchase.mockResolvedValue(true);
    mocks.applyGooglePurchase.mockResolvedValue({ ok: true, plan: "monthly", newlyRecorded: true });
    mocks.trackEventOnce.mockResolvedValue(true);
  });

  it("records access before acknowledgement and reports a recoverable pending confirmation", async () => {
    mocks.acknowledgePurchase.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ recorded: true, plan: "monthly" });
    expect(mocks.applyGooglePurchase).toHaveBeenCalledOnce();
    expect(mocks.acknowledgePurchase).toHaveBeenCalledOnce();
    expect(mocks.applyGooglePurchase.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.acknowledgePurchase.mock.invocationCallOrder[0],
    );
    expect(mocks.trackEventOnce).not.toHaveBeenCalled();
  });

  it("persists the verified purchase before acknowledging it", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.acknowledgePurchase).toHaveBeenCalledOnce();
    expect(mocks.applyGooglePurchase).toHaveBeenCalledOnce();
    expect(mocks.applyGooglePurchase.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.acknowledgePurchase.mock.invocationCallOrder[0],
    );
    expect(mocks.trackEventOnce).toHaveBeenCalledWith(
      "purchase_google",
      "google:purchase-token-long-enough",
      { userId: "buyer-1", meta: { plan: "monthly" } },
    );
  });

  it("retries the same idempotent conversion when the same token is restored", async () => {
    mocks.applyGooglePurchase.mockResolvedValue({ ok: true, plan: "monthly", newlyRecorded: false });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.trackEventOnce).toHaveBeenCalledWith(
      "purchase_google",
      "google:purchase-token-long-enough",
      { userId: "buyer-1", meta: { plan: "monthly" } },
    );
  });

  it("keeps native delivery queued when durable conversion storage is unavailable", async () => {
    mocks.trackEventOnce.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ recorded: true, trackingPending: true, plan: "monthly" });
  });

  it("never acknowledges when persisting the purchase fails", async () => {
    mocks.applyGooglePurchase.mockResolvedValue({ ok: false, error: "owner" });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocks.applyGooglePurchase).toHaveBeenCalledOnce();
    expect(mocks.acknowledgePurchase).not.toHaveBeenCalled();
    expect(mocks.trackEventOnce).not.toHaveBeenCalled();
  });

  it("persists a verified inactive purchase without acknowledging or tracking it", async () => {
    mocks.fetchPurchase.mockResolvedValue({
      productId: "monthly", active: false, needsAck: false,
      obfuscatedAccountId: "account-binding-buyer-1",
    });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(mocks.applyGooglePurchase).toHaveBeenCalledOnce();
    expect(mocks.acknowledgePurchase).not.toHaveBeenCalled();
    expect(mocks.trackEventOnce).not.toHaveBeenCalled();
  });

  it("never applies a revocation belonging to another account", async () => {
    mocks.fetchPurchase.mockResolvedValue({
      productId: "monthly", active: false, needsAck: false,
      obfuscatedAccountId: "another-account",
    });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.applyGooglePurchase).not.toHaveBeenCalled();
    expect(mocks.acknowledgePurchase).not.toHaveBeenCalled();
    expect(mocks.trackEventOnce).not.toHaveBeenCalled();
  });

  it("does not acknowledge or count a late verification superseded by newer state", async () => {
    mocks.applyGooglePurchase.mockResolvedValue({ ok: true, plan: "monthly", newlyRecorded: false, stale: true });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.acknowledgePurchase).not.toHaveBeenCalled();
    expect(mocks.trackEventOnce).not.toHaveBeenCalled();
  });

  it("rejects a token whose verified product differs from the requested product", async () => {
    mocks.fetchPurchase.mockResolvedValue({
      productId: "annual",
      active: true,
      needsAck: true,
      obfuscatedAccountId: "account-binding-buyer-1",
    });

    const response = await POST(request("monthly"));

    expect(response.status).toBe(409);
    expect(mocks.applyGooglePurchase).not.toHaveBeenCalled();
    expect(mocks.acknowledgePurchase).not.toHaveBeenCalled();
  });

  it("rejects a purchase bound to another ExecLingo account", async () => {
    mocks.fetchPurchase.mockResolvedValue({
      productId: "monthly",
      active: true,
      needsAck: true,
      obfuscatedAccountId: "account-binding-someone-else",
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.applyGooglePurchase).not.toHaveBeenCalled();
    expect(mocks.acknowledgePurchase).not.toHaveBeenCalled();
  });

  it("fails closed when Google returns no account binding", async () => {
    mocks.fetchPurchase.mockResolvedValue({ productId: "monthly", active: true, needsAck: true });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.applyGooglePurchase).not.toHaveBeenCalled();
    expect(mocks.acknowledgePurchase).not.toHaveBeenCalled();
  });

  it("blocks maintenance before contacting Google when the programme was never purchased", async () => {
    mocks.maintenanceUnlocked.mockReturnValue(false);

    const response = await POST(request("maintenance"));

    expect(response.status).toBe(403);
    expect(mocks.getBilling).toHaveBeenCalledWith("buyer-1");
    expect(mocks.fetchPurchase).not.toHaveBeenCalled();
    expect(mocks.applyGooglePurchase).not.toHaveBeenCalled();
    expect(mocks.acknowledgePurchase).not.toHaveBeenCalled();
  });

  it("allows maintenance verification after the programme entitlement is established", async () => {
    mocks.fetchPurchase.mockResolvedValue({
      productId: "maintenance",
      active: true,
      needsAck: true,
      obfuscatedAccountId: "account-binding-buyer-1",
    });
    mocks.applyGooglePurchase.mockResolvedValue({ ok: true, plan: "maintenance", newlyRecorded: true });

    const response = await POST(request("maintenance"));

    expect(response.status).toBe(200);
    expect(mocks.getBilling).toHaveBeenCalledWith("buyer-1");
    expect(mocks.fetchPurchase).toHaveBeenCalledWith("purchase-token-long-enough", "maintenance");
    expect(mocks.applyGooglePurchase).toHaveBeenCalledOnce();
    expect(mocks.acknowledgePurchase).toHaveBeenCalledOnce();
  });
});

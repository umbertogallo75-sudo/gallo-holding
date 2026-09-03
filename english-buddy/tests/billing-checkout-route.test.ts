import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  db: vi.fn(),
  dbExecute: vi.fn(),
  stripeConfigured: vi.fn(),
  getBilling: vi.fn(),
  getEntitlement: vi.fn(),
  isStripeCustomer: vi.fn(),
  maintenanceUnlocked: vi.fn(),
  createCheckout: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getUserId: mocks.getUserId }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/stripe", () => ({
  stripeConfigured: mocks.stripeConfigured,
  getBilling: mocks.getBilling,
  getEntitlement: mocks.getEntitlement,
  isStripeCustomer: mocks.isStripeCustomer,
  maintenanceUnlocked: mocks.maintenanceUnlocked,
  createCheckout: mocks.createCheckout,
}));

import { POST } from "@/app/api/billing/checkout/route";

function request(plan: "monthly" | "annual" | "program" | "maintenance") {
  return new Request("https://www.execlingo.it/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
}

describe("Stripe checkout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_BASE_URL = "https://www.execlingo.it/";
    mocks.getUserId.mockResolvedValue("buyer-web-1");
    mocks.stripeConfigured.mockReturnValue(true);
    mocks.getBilling.mockResolvedValue(null);
    mocks.getEntitlement.mockResolvedValue({ access: false, reason: "locked" });
    mocks.isStripeCustomer.mockImplementation((billing) =>
      Boolean(billing?.stripeCustomerId?.startsWith("cus_")),
    );
    mocks.maintenanceUnlocked.mockReturnValue(false);
    mocks.dbExecute.mockResolvedValue({ rows: [{ email: "buyer@example.it" }] });
    mocks.db.mockReturnValue({ execute: mocks.dbExecute });
    mocks.createCheckout.mockResolvedValue("https://checkout.stripe.test/annual");
  });

  it("returns 409 for an account that already has an active plan", async () => {
    mocks.getBilling.mockResolvedValue({
      stripeCustomerId: "google:existing-token",
      plan: "monthly",
      status: "active",
    });
    mocks.getEntitlement.mockResolvedValue({ access: true, reason: "plan", plan: "monthly" });

    const response = await POST(request("annual"));

    expect(response.status).toBe(409);
    expect(mocks.dbExecute).not.toHaveBeenCalled();
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it.each(["active", "past_due"])(
    "returns 409 while an existing Stripe subscription is %s",
    async (status) => {
      mocks.getBilling.mockResolvedValue({
        stripeCustomerId: "cus_existing_subscription",
        plan: "monthly",
        status,
      });

      const response = await POST(request("annual"));

      expect(response.status).toBe(409);
      expect(mocks.isStripeCustomer).toHaveBeenCalled();
      expect(mocks.dbExecute).not.toHaveBeenCalled();
      expect(mocks.createCheckout).not.toHaveBeenCalled();
    },
  );

  it("returns 403 for maintenance when the programme was never purchased", async () => {
    const response = await POST(request("maintenance"));

    expect(response.status).toBe(403);
    expect(mocks.maintenanceUnlocked).toHaveBeenCalledWith(null);
    expect(mocks.dbExecute).not.toHaveBeenCalled();
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("creates the annual checkout for an eligible account", async () => {
    const response = await POST(request("annual"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ url: "https://checkout.stripe.test/annual" });
    expect(mocks.createCheckout).toHaveBeenCalledWith(
      "buyer-web-1",
      "buyer@example.it",
      "annual",
      "https://www.execlingo.it",
    );
  });
});

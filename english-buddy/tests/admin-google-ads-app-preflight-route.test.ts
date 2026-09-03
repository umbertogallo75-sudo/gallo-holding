import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  isAdminUser: vi.fn(),
  validateGoogleAdsAppCampaignPreflight: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthSession: mocks.getAuthSession }));
vi.mock("@/lib/admin-access", () => ({ isAdminUser: mocks.isAdminUser }));
vi.mock("@/lib/marketing/google-ads-app-preflight", () => ({
  validateGoogleAdsAppCampaignPreflight: mocks.validateGoogleAdsAppCampaignPreflight,
}));

import { POST } from "@/app/api/admin/google-ads/app-preflight/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthSession.mockResolvedValue({ userId: "owner", method: "password" });
  mocks.isAdminUser.mockResolvedValue(true);
  mocks.validateGoogleAdsAppCampaignPreflight.mockResolvedValue({
    ok: true,
    status: "valid",
    detail: "Validazione completata senza creare risorse.",
    operationCount: 6,
    issues: [],
  });
});

function request(origin = "https://www.execlingo.it", body = "{}") {
  return new Request("https://www.execlingo.it/api/admin/google-ads/app-preflight", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body,
  });
}

describe("POST /api/admin/google-ads/app-preflight", () => {
  it("rejects cross-site requests before reading the ADMIN session", async () => {
    const response = await POST(request("https://attacker.example"));

    expect(response.status).toBe(403);
    expect(mocks.getAuthSession).not.toHaveBeenCalled();
    expect(mocks.validateGoogleAdsAppCampaignPreflight).not.toHaveBeenCalled();
  });

  it("fails closed for a non-admin session", async () => {
    mocks.isAdminUser.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.validateGoogleAdsAppCampaignPreflight).not.toHaveBeenCalled();
  });

  it("runs the fixed server-side preflight and ignores arbitrary client data", async () => {
    const response = await POST(request(
      "https://www.execlingo.it",
      JSON.stringify({ packageName: "attacker.app", status: "ENABLED", amountMicros: "999999999" }),
    ));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(data).toMatchObject({ ok: true, status: "valid", operationCount: 6 });
    expect(mocks.validateGoogleAdsAppCampaignPreflight).toHaveBeenCalledWith();
  });

  it.each([
    ["invalid", 422],
    ["not_configured", 503],
    ["error", 502],
  ] as const)("maps %s to a non-success HTTP status", async (status, expectedStatus) => {
    mocks.validateGoogleAdsAppCampaignPreflight.mockResolvedValue({
      ok: false,
      status,
      detail: "Nessuna risorsa creata.",
      operationCount: status === "not_configured" ? 0 : 6,
      issues: [],
    });

    const response = await POST(request());

    expect(response.status).toBe(expectedStatus);
  });
});

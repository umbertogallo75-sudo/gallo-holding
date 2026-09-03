import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAuthUser: vi.fn(),
  sendMarketing: vi.fn(),
  attributeSignup: vi.fn(),
  rateLimit: vi.fn(),
  recordRegistration: vi.fn(),
  googleEnabled: vi.fn(),
  appleEnabled: vi.fn(),
  verifyOauthState: vi.fn(),
  decodeIdToken: vi.fn(),
  validClaims: vi.fn(),
  findOrCreateOAuthUser: vi.fn(),
  appleClientSecret: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  safeEqual: vi.fn((left: string, right: string) => left === right),
  createSessionToken: vi.fn(() => "session-token"),
  SESSION_COOKIE: "eb_session",
  SESSION_MAX_AGE_SECONDS: 3600,
}));
vi.mock("@/lib/auth-users", () => ({ createAuthUser: mocks.createAuthUser }));
vi.mock("@/lib/marketing/send", () => ({
  sendMarketing: mocks.sendMarketing,
  onceKey: vi.fn(() => "once-key"),
}));
vi.mock("@/lib/marketing/templates", () => ({ welcomeTrial: vi.fn(() => ({ subject: "Welcome" })) }));
vi.mock("@/lib/partners", () => ({ attributeSignup: mocks.attributeSignup }));
vi.mock("@/lib/rate-limit", () => ({
  clientKey: vi.fn(() => "register:test"),
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/registration-tracking", () => ({ recordRegistration: mocks.recordRegistration }));
vi.mock("@/lib/oauth", () => ({
  baseUrl: vi.fn(() => "https://www.execlingo.it"),
  googleEnabled: mocks.googleEnabled,
  appleEnabled: mocks.appleEnabled,
  verifyOauthState: mocks.verifyOauthState,
  decodeIdToken: mocks.decodeIdToken,
  validClaims: mocks.validClaims,
  findOrCreateOAuthUser: mocks.findOrCreateOAuthUser,
  appleClientSecret: mocks.appleClientSecret,
}));

import { POST as registerWithPassword } from "@/app/api/auth/register/route";
import { GET as registerWithGoogle } from "@/app/api/auth/google/callback/route";
import { POST as registerWithApple } from "@/app/api/auth/apple/callback/route";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.INVITE_CODE;
  mocks.createAuthUser.mockResolvedValue("password-user");
  mocks.sendMarketing.mockResolvedValue(undefined);
  mocks.attributeSignup.mockResolvedValue(undefined);
  mocks.rateLimit.mockReturnValue({ allowed: true });
  mocks.recordRegistration.mockResolvedValue(undefined);
  mocks.googleEnabled.mockReturnValue(true);
  mocks.appleEnabled.mockReturnValue(true);
  mocks.verifyOauthState.mockReturnValue(true);
  mocks.decodeIdToken.mockReturnValue({ sub: "provider-sub", email: "user@example.com", name: "Test User" });
  mocks.validClaims.mockReturnValue(true);
  mocks.findOrCreateOAuthUser.mockResolvedValue({ userId: "oauth-user", created: true });
  mocks.appleClientSecret.mockReturnValue("apple-secret");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id_token: "id-token" })));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("registration routes", () => {
  it("records email/password account creation with the original request", async () => {
    const request = new Request("https://www.execlingo.it/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test User", email: "user@example.com", code: "password123" }),
    });

    const response = await registerWithPassword(request);

    expect(response.status).toBe(200);
    expect(mocks.recordRegistration).toHaveBeenCalledWith(request, "password-user");
  });

  it("does not strand a newly-created password account when measurement is temporarily unavailable", async () => {
    mocks.recordRegistration.mockRejectedValueOnce(new Error("analytics unavailable"));
    const request = new Request("https://www.execlingo.it/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test User", email: "user@example.com", code: "password123" }),
    });

    const response = await registerWithPassword(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("records a newly-created Google account with the callback request", async () => {
    const request = new Request("https://www.execlingo.it/api/auth/google/callback?code=code&state=state", {
      headers: { "user-agent": "ExecLingoAndroid/1.0" },
    });

    const response = await registerWithGoogle(request);

    expect(mocks.recordRegistration).toHaveBeenCalledWith(request, "oauth-user");
    expect(response.headers.get("location")).toBe("https://www.execlingo.it/onboarding?signup=1");
  });

  it("records a newly-created Apple account with the callback request", async () => {
    const request = new Request("https://www.execlingo.it/api/auth/apple/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "user-agent": "ExecLingoApp/1.0",
      },
      body: new URLSearchParams({ code: "code", state: "state" }),
    });

    const response = await registerWithApple(request);

    expect(mocks.recordRegistration).toHaveBeenCalledWith(request, "oauth-user");
    expect(response.headers.get("location")).toBe("https://www.execlingo.it/onboarding?signup=1");
  });

  it.each([
    ["Google", async () => registerWithGoogle(new Request("https://www.execlingo.it/api/auth/google/callback?code=code&state=state"))],
    ["Apple", async () => registerWithApple(new Request("https://www.execlingo.it/api/auth/apple/callback", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: "code", state: "state" }),
    }))],
  ])("sends an existing %s account directly into the product", async (_provider, callback) => {
    mocks.findOrCreateOAuthUser.mockResolvedValueOnce({ userId: "oauth-user", created: false });

    const response = await callback();

    expect(response.headers.get("location")).toBe("https://www.execlingo.it/home");
    expect(mocks.recordRegistration).not.toHaveBeenCalled();
  });
});

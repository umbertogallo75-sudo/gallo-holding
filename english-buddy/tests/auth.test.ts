import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-that-is-definitely-32-characters-long";
});

describe("session tokens", () => {
  it("accepts a freshly created token", async () => {
    const { createSessionToken, isValidSessionToken } = await import("@/lib/auth");
    expect(isValidSessionToken(createSessionToken())).toBe(true);
  });

  it("rejects tampered tokens", async () => {
    const { createSessionToken, isValidSessionToken } = await import("@/lib/auth");
    const token = createSessionToken();
    expect(isValidSessionToken(token.slice(0, -2) + "aa")).toBe(false);
    expect(isValidSessionToken("owner.9999999999999.deadbeef")).toBe(false);
    expect(isValidSessionToken("")).toBe(false);
    expect(isValidSessionToken(null)).toBe(false);
  });

  it("rejects expired tokens", async () => {
    const { createSessionToken, isValidSessionToken, SESSION_MAX_AGE_SECONDS } = await import("@/lib/auth");
    const issuedAt = Date.now() - (SESSION_MAX_AGE_SECONDS + 60) * 1000;
    expect(isValidSessionToken(createSessionToken(issuedAt))).toBe(false);
  });

  it("compares strings in constant-time helper without leaking length errors", async () => {
    const { safeEqual } = await import("@/lib/auth");
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

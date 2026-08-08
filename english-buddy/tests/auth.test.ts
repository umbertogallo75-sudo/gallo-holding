import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-that-is-definitely-32-characters-long";
});

describe("session tokens", () => {
  it("accepts a freshly created token and returns its user id", async () => {
    const { createSessionToken, parseSessionToken } = await import("@/lib/auth");
    expect(parseSessionToken(createSessionToken("owner"))).toBe("owner");
    const uuid = "0b40e727-9d6c-4b8c-9d3a-1c2f4a5b6c7d";
    expect(parseSessionToken(createSessionToken(uuid))).toBe(uuid);
  });

  it("rejects tampered tokens", async () => {
    const { createSessionToken, parseSessionToken } = await import("@/lib/auth");
    const token = createSessionToken("owner");
    expect(parseSessionToken(token.slice(0, -2) + "aa")).toBeNull();
    expect(parseSessionToken("owner.9999999999999.deadbeef")).toBeNull();
    expect(parseSessionToken("")).toBeNull();
    expect(parseSessionToken(null)).toBeNull();
  });

  it("rejects a token whose user id was swapped", async () => {
    const { createSessionToken, parseSessionToken } = await import("@/lib/auth");
    const token = createSessionToken("owner");
    const signature = token.slice(token.lastIndexOf(".") + 1);
    const expiry = token.split(".")[1];
    expect(parseSessionToken(`intruso.${expiry}.${signature}`)).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const { createSessionToken, parseSessionToken, SESSION_MAX_AGE_SECONDS } = await import("@/lib/auth");
    const issuedAt = Date.now() - (SESSION_MAX_AGE_SECONDS + 60) * 1000;
    expect(parseSessionToken(createSessionToken("owner", issuedAt))).toBeNull();
  });

  it("compares strings in constant-time helper without leaking length errors", async () => {
    const { safeEqual } = await import("@/lib/auth");
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("hashes access codes deterministically and distinctly", async () => {
    const { accessCodeHash } = await import("@/lib/auth");
    expect(accessCodeHash("codice-a")).toBe(accessCodeHash("codice-a"));
    expect(accessCodeHash("codice-a")).not.toBe(accessCodeHash("codice-b"));
    expect(accessCodeHash("codice-a")).not.toContain("codice-a");
  });
});

import { describe, expect, it } from "vitest";
import { CONSENT_COOKIE, CONSENT_VERSION, consentCookieValue, readConsent, readConsentReceipt } from "@/lib/consent";

const RECEIPT = "3f8a1c22-9d44-4b71-9a55-0e2c7b6d1a90";
const cookie = (value: string) => `${CONSENT_COOKIE}=${encodeURIComponent(value)}`;

describe("readConsent", () => {
  it("reads both answers", () => {
    expect(readConsent(cookie(consentCookieValue("granted", RECEIPT)))).toBe("granted");
    expect(readConsent(cookie(consentCookieValue("denied", RECEIPT)))).toBe("denied");
  });

  it("treats no cookie as no answer, so the banner asks", () => {
    expect(readConsent(null)).toBeNull();
    expect(readConsent("")).toBeNull();
    expect(readConsent("session=abc; eb_src=%7B%7D")).toBeNull();
  });

  it("finds the cookie among others", () => {
    expect(readConsent(`eb_ref=x; ${cookie(consentCookieValue("denied", RECEIPT))}; session=y`)).toBe("denied");
  });

  it("asks again when the policy version has moved on", () => {
    expect(readConsent(cookie(`0:granted:${RECEIPT}`))).toBeNull();
    expect(readConsent(cookie(`${CONSENT_VERSION}:granted:${RECEIPT}`))).toBe("granted");
  });

  it("never reads a hand-edited value as consent", () => {
    expect(readConsent(cookie(`${CONSENT_VERSION}:yes`))).toBeNull();
    expect(readConsent(cookie("granted"))).toBeNull();
    expect(readConsent(`${CONSENT_COOKIE}=%E0%A4%A`)).toBeNull();
  });
});

describe("readConsentReceipt", () => {
  it("hands back the id of the log row this choice was written to", () => {
    expect(readConsentReceipt(cookie(consentCookieValue("granted", RECEIPT)))).toBe(RECEIPT);
  });

  it("is null for a cookie from before receipts existed", () => {
    expect(readConsentReceipt(cookie(`${CONSENT_VERSION}:granted`))).toBeNull();
    expect(readConsentReceipt(null)).toBeNull();
  });

  it("ignores a receipt from a superseded policy version", () => {
    expect(readConsentReceipt(cookie(`0:granted:${RECEIPT}`))).toBeNull();
  });

  it("refuses an oversized receipt rather than passing it on", () => {
    expect(readConsentReceipt(cookie(`${CONSENT_VERSION}:granted:${"x".repeat(200)}`))).toBeNull();
  });
});

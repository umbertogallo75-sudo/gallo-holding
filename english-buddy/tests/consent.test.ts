import { describe, expect, it } from "vitest";
import { CONSENT_COOKIE, CONSENT_VERSION, consentCookieValue, readConsent } from "@/lib/consent";

const cookie = (value: string) => `${CONSENT_COOKIE}=${encodeURIComponent(value)}`;

describe("readConsent", () => {
  it("reads both answers", () => {
    expect(readConsent(cookie(consentCookieValue("granted")))).toBe("granted");
    expect(readConsent(cookie(consentCookieValue("denied")))).toBe("denied");
  });

  it("treats no cookie as no answer, so the banner asks", () => {
    expect(readConsent(null)).toBeNull();
    expect(readConsent("")).toBeNull();
    expect(readConsent("session=abc; eb_src=%7B%7D")).toBeNull();
  });

  it("finds the cookie among others", () => {
    expect(readConsent(`eb_ref=x; ${cookie(consentCookieValue("denied"))}; session=y`)).toBe("denied");
  });

  it("asks again when the policy version has moved on", () => {
    expect(readConsent(cookie("0:granted"))).toBeNull();
    expect(readConsent(cookie(`${CONSENT_VERSION}:granted`))).toBe("granted");
  });

  it("never reads a hand-edited value as consent", () => {
    expect(readConsent(cookie(`${CONSENT_VERSION}:yes`))).toBeNull();
    expect(readConsent(cookie("granted"))).toBeNull();
    expect(readConsent(`${CONSENT_COOKIE}=%E0%A4%A`)).toBeNull();
  });
});

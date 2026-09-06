import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { META_CURRENCY } from "@/lib/conversions";

const source = readFileSync("src/lib/conversions.ts", "utf8");

/**
 * Events Manager flagged every registration we have ever sent:
 *
 *   CompleteRegistration — Currency field is missing — Ex. "" isn't allowed
 *
 * The currency is now sent. The value is not, and that is the part worth
 * holding: a registration is free, and putting a number on it to clear a
 * warning would make the one field in the account that is supposed to mean
 * money mean something else.
 */
describe("the Meta registration event", () => {
  it("sends the currency", () => {
    expect(META_CURRENCY).toBe("EUR");
    expect(source).toContain('fbq("track", "CompleteRegistration", { currency: META_CURRENCY })');
  });

  it("puts no price on a free registration", () => {
    const call = source.slice(source.indexOf('fbq("track", "CompleteRegistration"'));
    expect(call.slice(0, 120)).not.toContain("value");
  });

  it("still reports each platform once per page load", () => {
    // The guard that stops a re-render, or an OAuth return, counting twice.
    for (const flag of ["metaReported", "googleReported", "ga4Reported", "linkedinReported", "tiktokReported"]) {
      expect(source, `manca la guardia ${flag}`).toContain(`${flag} = true`);
    }
  });

  it("stays behind advertising consent", () => {
    // The tags themselves are only installed after consent, and the retry
    // path refuses to run without it: a later yes must not release an event
    // that happened before it.
    expect(source).toContain('readConsent(document.cookie) !== "granted"');
  });
});

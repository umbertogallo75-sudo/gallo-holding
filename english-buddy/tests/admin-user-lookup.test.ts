import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/app/api/admin/route.ts", "utf8");
const page = readFileSync("src/app/admin/page.tsx", "utf8");

/**
 * The first erasure request arrived and the account could not be found. The
 * user list is built from `profiles`, and a profile is only created when
 * somebody finishes onboarding — so whoever registered and stopped before
 * that was invisible. Under article 17 a controller who cannot find the
 * person cannot answer them, so this is a legal gap and not a convenience.
 */
describe("finding an account for a GDPR request", () => {
  it("searches where an account actually begins, not where onboarding ends", () => {
    expect(route).toContain('action: z.literal("finduser")');
    expect(route).toContain("FROM auth_users WHERE lower(email) = ?");
  });

  it("says whether the person ever completed onboarding", () => {
    expect(route).toContain("hasProfile");
  });

  it("warns about a live plan before the account is destroyed", () => {
    // Deleting does not cancel a recurring subscription, and afterwards the
    // person has no way left to cancel it themselves.
    expect(route).toContain("getEntitlement(userId)");
    expect(readFileSync("src/app/admin/AdminUserLookup.tsx", "utf8")).toContain("va disdetto prima");
  });

  it("is reachable from the admin page", () => {
    expect(page).toContain("<AdminUserLookup />");
  });
});

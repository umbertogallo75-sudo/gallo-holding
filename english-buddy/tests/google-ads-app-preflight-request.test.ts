import { describe, expect, it } from "vitest";
import { buildGoogleAdsAppPreflightRequest } from "@/lib/marketing/google-ads-app-preflight";

/**
 * The preflight asks Google Ads "would this be accepted?" and must never do
 * anything else. Production answered:
 *
 *   adGroupAdError:AD_TYPE_CANNOT_BE_PAUSED
 *   mutate_operations[5].ad_group_ad_operation.create.status
 *
 * An App ad cannot carry a paused status. The brake belongs to the campaign
 * and the ad group, and those are what these tests hold — because moving the
 * brake off the ad is only safe as long as the ones above it stay on.
 */
const request = buildGoogleAdsAppPreflightRequest("1234567890");

function operation(kind: string): Record<string, unknown> {
  const found = request.mutateOperations.find((op) => kind in op) as Record<string, Record<string, Record<string, unknown>>>;
  expect(found, `manca l'operazione ${kind}`).toBeTruthy();
  return found[kind].create;
}

describe("the Android preflight request", () => {
  it("does not try to pause the App ad", () => {
    expect(operation("adGroupAdOperation").status).toBe("ENABLED");
  });

  it("keeps the brake where Google Ads accepts it", () => {
    expect(operation("campaignOperation").status).toBe("PAUSED");
    expect(operation("adGroupOperation").status).toBe("PAUSED");
  });

  it("creates nothing, whatever the answer is", () => {
    expect(request.validateOnly).toBe(true);
    // All or nothing: a partial failure would mean some of it had been made.
    expect(request.partialFailure).toBe(false);
    expect(request.responseContentType).toBe("RESOURCE_NAME_ONLY");
  });

  it("stays inside the temporary ids of its own request", () => {
    // Negative resource names exist only within one mutate call, so nothing
    // here can name — or touch — a campaign that already exists and spends.
    const json = JSON.stringify(request);
    expect(json).toContain("campaigns/-2");
    expect(json).toContain("adGroups/-3");
    expect(json).toContain("campaignBudgets/-1");
    expect(json).not.toMatch(/campaigns\/\d/);
  });

  it("asks for the country and the language it was authorised for, and no other", () => {
    const criteria = request.mutateOperations.filter((op) => "campaignCriterionOperation" in op);
    expect(criteria).toHaveLength(2);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/marketing/performance-report.ts", "utf8");

/**
 * LinkedIn returned spend and leads but its budget arrived at the report as a
 * bare N/D. The reason had been computed by fetchLinkedInCampaignBudgets,
 * written to the store, and then thrown away here — every budget field was
 * carried "only if the source is meta". A missing number that says why is
 * worth ten that do not.
 */
describe("budget reasons reach the report", () => {
  it("no longer carries the budget for one source only", () => {
    expect(source).not.toContain('budgetDetail: metric.source === "meta"');
    expect(source).not.toContain('budgetStatus: metric.source === "meta"');
  });

  it("decides by whether the source has a budget, not by its name", () => {
    expect(source).toContain("function hasBudgetConcept");
    expect(source).toContain('metric.budgetStatus !== "not_configured"');
    expect(source).toContain("budgetDetail: hasBudgetConcept(metric)");
  });

  it("keeps app stores out of it: they have no budget to report", () => {
    // App Store and Play set budgetStatus "not_configured", so the guard above
    // leaves their budget null rather than printing "not applicable" as if it
    // were a finding.
    const other = readFileSync("src/lib/marketing/other-reporting.ts", "utf8");
    expect(other).toContain('budgetStatus: source === "linkedin" ? status : "not_configured"');
  });
});

import { describe, expect, it } from "vitest";
import { visiblePreflightIssues } from "@/app/admin/GoogleAdsAppPreflightControl";

describe("Google Ads App preflight ADMIN control", () => {
  it("renders at most three bounded provider issues", () => {
    const issues = visiblePreflightIssues([
      { code: "ONE", message: "First", fieldPath: "campaign.app" },
      { code: "TWO", message: "Second", fieldPath: null },
      { code: "THREE", message: "Third", fieldPath: "ad.text" },
      { code: "FOUR", message: "Must not be rendered" },
    ]);

    expect(issues).toEqual([
      { code: "ONE", message: "First", fieldPath: "campaign.app" },
      { code: "TWO", message: "Second", fieldPath: null },
      { code: "THREE", message: "Third", fieldPath: "ad.text" },
    ]);
  });

  it("normalises malformed values without rendering arbitrary objects", () => {
    const issues = visiblePreflightIssues([
      null,
      { code: "", message: 123, fieldPath: { unsafe: true } },
    ]);

    expect(issues).toEqual([
      { code: "GOOGLE_ADS_ERROR", message: "Configurazione non valida.", fieldPath: null },
      { code: "GOOGLE_ADS_ERROR", message: "Configurazione non valida.", fieldPath: null },
    ]);
  });
});

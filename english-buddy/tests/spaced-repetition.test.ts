import { describe, expect, it } from "vitest";
import { isMastered, MAX_INTERVAL_DAYS, nextIntervalDays, nextReviewAt } from "@/lib/learning/spaced-repetition";

describe("spaced repetition", () => {
  it("grows the interval on success", () => {
    expect(nextIntervalDays(1, true)).toBeGreaterThan(1);
    expect(nextIntervalDays(10, true)).toBeGreaterThan(10);
  });

  it("caps the interval", () => {
    expect(nextIntervalDays(1000, true)).toBe(MAX_INTERVAL_DAYS);
  });

  it("resets to one day on failure", () => {
    expect(nextIntervalDays(30, false)).toBe(1);
  });

  it("treats invalid stored intervals as the minimum", () => {
    expect(nextIntervalDays(0, true)).toBeGreaterThanOrEqual(2);
    expect(nextIntervalDays(NaN as unknown as number, true)).toBeGreaterThanOrEqual(2);
  });

  it("requires sustained success for mastery", () => {
    expect(isMastered(1, 30)).toBe(false);
    expect(isMastered(5, 5)).toBe(false);
    expect(isMastered(5, 25)).toBe(true);
  });

  it("schedules the next review in the future", () => {
    const next = new Date(nextReviewAt(2)).getTime();
    expect(next).toBeGreaterThan(Date.now() + 1.9 * 24 * 60 * 60 * 1000);
  });
});

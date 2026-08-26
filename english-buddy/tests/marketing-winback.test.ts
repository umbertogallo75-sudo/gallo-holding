import { describe, expect, it } from "vitest";
import { MAX_REMINDERS, winBackFor, winBackKey, winBackKind } from "@/lib/marketing/winback";

/** The ladder as Umberto described it: 3, 7, 15, then every 5 days. */
describe("winBackFor", () => {
  it("stays silent while somebody is simply having a busy couple of days", () => {
    for (const days of [0, 1, 2]) expect(winBackFor(days), String(days)).toBeNull();
  });

  it("sends the soft letter from day 3 to day 6", () => {
    for (const days of [3, 4, 5, 6]) expect(winBackFor(days)?.stage, String(days)).toBe("soft");
  });

  it("hardens at a week, and again at a fortnight", () => {
    for (const days of [7, 10, 14]) expect(winBackFor(days)?.stage, String(days)).toBe("firm");
    for (const days of [15, 17, 19]) expect(winBackFor(days)?.stage, String(days)).toBe("hard");
  });

  it("then reminds every five days, counting from the fortnight", () => {
    expect(winBackFor(20)).toEqual({ stage: "reminder", index: 1 });
    expect(winBackFor(24)).toEqual({ stage: "reminder", index: 1 });
    expect(winBackFor(25)).toEqual({ stage: "reminder", index: 2 });
    expect(winBackFor(45)).toEqual({ stage: "reminder", index: 6 });
  });

  it("stops instead of writing forever", () => {
    // Writing to somebody who has plainly gone costs the sending reputation,
    // and the people still reading are the ones who pay for it in spam.
    const lastDay = 15 + MAX_REMINDERS * 5;
    expect(winBackFor(lastDay)?.index).toBe(MAX_REMINDERS);
    expect(winBackFor(lastDay + 5)).toBeNull();
    expect(winBackFor(400)).toBeNull();
  });

  it("does not fall over on a broken date", () => {
    expect(winBackFor(NaN)).toBeNull();
    expect(winBackFor(-3)).toBeNull();
  });
});

describe("winBackKey", () => {
  it("gives each rung its own claim, so the ladder never repeats a step", () => {
    const soft = winBackKey("u1", { stage: "soft", index: 0 }, "2026-09-01");
    const firm = winBackKey("u1", { stage: "firm", index: 0 }, "2026-09-01");
    const r1 = winBackKey("u1", { stage: "reminder", index: 1 }, "2026-09-01");
    const r2 = winBackKey("u1", { stage: "reminder", index: 2 }, "2026-09-01");
    expect(new Set([soft, firm, r1, r2]).size).toBe(4);
  });

  it("starts the ladder over when somebody returns and then lapses again", () => {
    // Without the date of the lapse in the key, every rung would be spent for
    // good and a returning user who drifted away a second time would never
    // hear anything at all.
    const first = winBackKey("u1", { stage: "soft", index: 0 }, "2026-09-01");
    const second = winBackKey("u1", { stage: "soft", index: 0 }, "2026-11-20");
    expect(first).not.toBe(second);
  });

  it("names the kind so the admin counts read plainly", () => {
    expect(winBackKind({ stage: "soft", index: 0 })).toBe("win_back_soft");
    expect(winBackKind({ stage: "reminder", index: 3 })).toBe("win_back_reminder");
  });
});

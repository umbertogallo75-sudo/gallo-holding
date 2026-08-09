import { describe, expect, it } from "vitest";
import { isQuietHour, localParts, shouldSend, windowForHour } from "@/lib/push/windows";

// 2026-08-08T10:30:00Z is 12:30 in Rome (CEST, UTC+2).
const NOW = new Date("2026-08-08T10:30:00Z");

describe("notification windows", () => {
  it("computes local hour and date in the user's timezone", () => {
    expect(localParts(NOW, "Europe/Rome")).toEqual({ hour: 12, dateKey: "2026-08-08" });
    expect(localParts(NOW, "America/New_York").hour).toBe(6);
    expect(localParts(NOW, "not-a-timezone").hour).toBe(10); // falls back to UTC
  });

  it("maps hours to windows", () => {
    expect(windowForHour(8)).toBe("morning");
    expect(windowForHour(12)).toBe("lunch");
    expect(windowForHour(20)).toBe("evening");
    expect(windowForHour(22)).toBeNull();
    expect(windowForHour(6)).toBeNull();
  });

  it("handles quiet hours, including ranges that wrap midnight", () => {
    expect(isQuietHour(23, 22, 7)).toBe(true);
    expect(isQuietHour(3, 22, 7)).toBe(true);
    expect(isQuietHour(12, 22, 7)).toBe(false);
    expect(isQuietHour(13, 12, 14)).toBe(true);
    expect(isQuietHour(9, 9, 9)).toBe(false); // equal bounds = no quiet hours
  });

  it("sends in an eligible window and dedupes per window per local day", () => {
    const base = { now: NOW, timeZone: "Europe/Rome", quietStart: 22, quietEnd: 7 };
    const due = shouldSend({ ...base, intensity: "immersive", alreadySentKinds: new Set() });
    expect(due).toEqual({ kind: "buddy:lunch:2026-08-08", window: "lunch" });

    const repeat = shouldSend({ ...base, intensity: "immersive", alreadySentKinds: new Set(["buddy:lunch:2026-08-08"]) });
    expect(repeat).toBeNull();
  });

  it("respects intensity levels", () => {
    const base = { now: NOW, timeZone: "Europe/Rome", quietStart: 22, quietEnd: 7, alreadySentKinds: new Set<string>() };
    expect(shouldSend({ ...base, intensity: "normal" })?.window).toBe("lunch"); // lunch allowed on normal
    expect(shouldSend({ ...base, intensity: "low" })).toBeNull(); // low = evening only

    const evening = new Date("2026-08-08T17:30:00Z"); // 19:30 Rome
    expect(shouldSend({ ...base, now: evening, intensity: "low" })?.window).toBe("evening");
  });

  it("suppresses everything during custom quiet hours", () => {
    const due = shouldSend({
      now: NOW,
      timeZone: "Europe/Rome",
      intensity: "immersive",
      quietStart: 12,
      quietEnd: 14,
      alreadySentKinds: new Set(),
    });
    expect(due).toBeNull();
  });

  it("stays silent at night regardless of intensity", () => {
    const night = new Date("2026-08-08T23:30:00Z"); // 01:30 Rome
    expect(shouldSend({ now: night, timeZone: "Europe/Rome", intensity: "immersive", quietStart: 22, quietEnd: 7, alreadySentKinds: new Set() })).toBeNull();
  });
});

import { bannerForNotification } from "@/lib/push/content";

describe("context-aware notification banners", () => {
  const seed = "user:buddy:morning:2026-08-09";
  it("matches topic first, then time window, then rotation", () => {
    expect(bannerForNotification({ question: "You're at a restaurant and the waiter arrives. What do you say?", seed })).toBe("/banners/banner-25.png");
    expect(bannerForNotification({ question: "You land at the airport and need a taxi. What do you ask?", seed })).toBe("/banners/banner-26.png");
    expect(bannerForNotification({ question: "How do you open a difficult meeting?", seed })).toBe("/banners/banner-27.png");
    expect(bannerForNotification({ question: "How do you usually start a difficult negotiation?", seed })).toBe("/banners/banner-11.png");
    expect(bannerForNotification({ question: "Would you invest in a company with weak margins?", seed })).toBe("/banners/banner-10.png");
    expect(bannerForNotification({ question: "Sam misses you!", kind: "nudge:manual", seed })).toBe("/banners/banner-24.png");
    expect(bannerForNotification({ question: "What made you smile today?", window: "morning", seed })).toBe("/banners/banner-21.png");
    expect(bannerForNotification({ question: "What made you smile today?", window: "lunch", seed })).toBe("/banners/banner-22.png");
    expect(bannerForNotification({ question: "What made you smile today?", window: "evening", seed })).toBe("/banners/banner-23.png");
    const generic = bannerForNotification({ question: "What made you smile today?", window: "afternoon", seed });
    expect(generic).toMatch(/\/banners\/banner-(0[1-9]|1[0-9]|20)\.png/);
  });
});

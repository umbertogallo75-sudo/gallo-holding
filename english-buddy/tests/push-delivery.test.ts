import { describe, expect, it } from "vitest";
import { sameApplicationServerKey } from "@/lib/push-client";
import { shouldSend } from "@/lib/push/windows";

/**
 * Measured in production: the hosted cron asks for sixteen runs a day and
 * delivers about four, landing near 11:00, 16:15 and 20:15 Rome time. Under
 * the old rule — "the window we are standing in" — somebody on the normal
 * intensity was never looked at during the morning or the lunch window, and
 * two of their three notifications did not exist.
 */
describe("notifications survive a scheduler that runs when it feels like it", () => {
  const base = { timeZone: "Europe/Rome", quietStart: 22, quietEnd: 7 };
  const at = (utc: string) => new Date(utc);

  it("catches up the morning at eleven, when the run finally arrives", () => {
    const due = shouldSend({ ...base, now: at("2026-09-05T09:00:00Z"), intensity: "normal", alreadySentKinds: new Set() });
    expect(due).toEqual({ kind: "buddy:morning:2026-09-05", window: "morning" });
  });

  it("gives the normal intensity all three of its windows across the day", () => {
    const sent = new Set<string>();
    for (const utc of ["2026-09-05T09:00:00Z", "2026-09-05T14:15:00Z", "2026-09-05T18:15:00Z"]) {
      const due = shouldSend({ ...base, now: at(utc), intensity: "normal", alreadySentKinds: sent });
      expect(due).not.toBeNull();
      sent.add(due!.kind);
    }
    expect([...sent]).toEqual([
      "buddy:morning:2026-09-05",
      "buddy:lunch:2026-09-05",
      "buddy:evening:2026-09-05",
    ]);
  });

  it("never piles the missed windows up into one evening", () => {
    const sent = new Set(["buddy:evening:2026-09-05"]);
    // 20:30 Rome, evening already sent, morning and lunch never were.
    expect(shouldSend({ ...base, now: at("2026-09-05T18:30:00Z"), intensity: "normal", alreadySentKinds: sent })).toBeNull();
  });

  it("still says nothing at night, and nothing before the first window", () => {
    expect(shouldSend({ ...base, now: at("2026-09-05T22:30:00Z"), intensity: "immersive", alreadySentKinds: new Set() })).toBeNull();
    // 07:30 Rome: out of quiet hours, but no window has begun.
    expect(shouldSend({ ...base, now: at("2026-09-05T05:30:00Z"), intensity: "immersive", alreadySentKinds: new Set() })).toBeNull();
  });
});

/**
 * Three accounts in production held a browser subscription the push service
 * answered 403 to at every run: made against a VAPID key we no longer use.
 * The browser reported them as active, so nobody was ever asked again.
 */
describe("a subscription bound to a key we no longer hold", () => {
  const key = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkFbx4gpXeTjLPeYqVLcFVaJ8Bd7ZwMPZLLnZ7hXjrXKqZLbYqZLbYo";
  const bytes = (base64: string) => {
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))).buffer as ArrayBuffer;
  };

  it("recognises its own key", () => {
    expect(sameApplicationServerKey(bytes(key), key)).toBe(true);
  });

  it("recognises somebody else's", () => {
    const other = key.slice(0, -4) + "AAAA";
    expect(sameApplicationServerKey(bytes(other), key)).toBe(false);
  });

  it("leaves a subscription alone when the browser will not say", () => {
    expect(sameApplicationServerKey(null, key)).toBe(true);
  });
});

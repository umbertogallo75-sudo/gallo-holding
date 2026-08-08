import { describe, expect, it } from "vitest";
import { CAPABILITIES, isCapabilityKey, monthPhase } from "@/lib/learning/capabilities";
import { coachResultSchema } from "@/lib/ai/types";

describe("3-month capability path", () => {
  it("computes the month phase from the path start date", () => {
    const now = new Date("2026-08-08T12:00:00Z");
    expect(monthPhase(null, now)).toBe(1);
    expect(monthPhase("not-a-date", now)).toBe(1);
    expect(monthPhase("2026-08-01T00:00:00Z", now)).toBe(1);
    expect(monthPhase("2026-07-01T00:00:00Z", now)).toBe(2);
    expect(monthPhase("2026-05-01T00:00:00Z", now)).toBe(3);
  });

  it("covers all three phases with capabilities", () => {
    expect(CAPABILITIES.some((c) => c.phase === 1)).toBe(true);
    expect(CAPABILITIES.some((c) => c.phase === 2)).toBe(true);
    expect(CAPABILITIES.some((c) => c.phase === 3)).toBe(true);
    expect(new Set(CAPABILITIES.map((c) => c.key)).size).toBe(CAPABILITIES.length);
  });

  it("validates capability keys", () => {
    expect(isCapabilityKey("introduce_yourself")).toBe(true);
    expect(isCapabilityKey("fly_a_plane")).toBe(false);
  });

  it("coach schema accepts and defaults the capabilities field", () => {
    expect(coachResultSchema.parse({ reply: "Hi" }).capabilities).toEqual([]);
    expect(coachResultSchema.parse({ reply: "Hi", capabilities: ["ask_repeat"] }).capabilities).toEqual(["ask_repeat"]);
  });
});

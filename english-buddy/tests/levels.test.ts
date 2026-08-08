import { describe, expect, it } from "vitest";
import { bandForScore, stepToward } from "@/lib/learning/levels";

describe("automatic CEFR progression", () => {
  it("maps skill averages to CEFR bands", () => {
    expect(bandForScore(30)).toBe("A1");
    expect(bandForScore(45)).toBe("A2");
    expect(bandForScore(55)).toBe("B1");
    expect(bandForScore(70)).toBe("B2");
    expect(bandForScore(80)).toBe("C1");
  });

  it("moves one step at a time, in both directions", () => {
    expect(stepToward("A1", "C1")).toBe("A2"); // never jumps
    expect(stepToward("B1", "B2")).toBe("B2");
    expect(stepToward("B2", "A2")).toBe("B1"); // can also step down
    expect(stepToward("B1", "B1")).toBe("B1"); // stable when in band
    expect(stepToward("unknown", "B1")).toBe("B1"); // normalizes to A2 first
  });
});

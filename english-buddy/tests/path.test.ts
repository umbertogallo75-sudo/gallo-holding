import { describe, expect, it } from "vitest";
import { CAPABILITIES } from "@/lib/learning/capabilities";
import {
  averageMark,
  markOf,
  marksFrom,
  pace,
  pathPercent,
  PATH_WEEKS,
  STAGES,
  stageProgress,
  timePercent,
  weakest,
  weekOfPath,
} from "@/lib/learning/path";

/**
 * The path as the learner sees it. The thing testers said was missing: the
 * sessions never added up to anything they could look at.
 */
describe("the stages", () => {
  it("spend every capability exactly once — nothing is unreachable, nothing counted twice", () => {
    const used = STAGES.flatMap((s) => s.capabilities);
    expect(used).toHaveLength(new Set(used).size);
    expect([...used].sort()).toEqual(CAPABILITIES.map((c) => c.key).sort());
  });

  it("covers the twelve weeks without a gap or an overlap", () => {
    let expected = 1;
    for (const stage of STAGES) {
      expect(stage.weeks[0], stage.key).toBe(expected);
      expect(stage.weeks[1]).toBeGreaterThanOrEqual(stage.weeks[0]);
      expected = stage.weeks[1] + 1;
    }
    expect(expected - 1).toBe(PATH_WEEKS);
  });

  it("gives every stage somewhere to go and something to do", () => {
    for (const stage of STAGES) {
      expect(stage.href, stage.key).toMatch(/^\//);
      expect(stage.title.length).toBeGreaterThan(3);
      expect(stage.goal.length).toBeGreaterThan(20);
    }
  });
});

describe("where you are on it", () => {
  it("marks the first unfinished stage as the one you are on", () => {
    const stages = stageProgress(["introduce_yourself", "ask_repeat", "understand_numbers"]);
    expect(stages[0].state).toBe("done");
    expect(stages[1].state).toBe("current");
    expect(stages[2].state).toBe("todo");
  });

  it("does not let the calendar complete a stage", () => {
    // Somebody who has been away for a fortnight comes back to what they were
    // doing, not to a stage they skipped.
    const stages = stageProgress([]);
    expect(stages[0].state).toBe("current");
    expect(stages.filter((s) => s.state === "current")).toHaveLength(1);
  });

  it("counts what is demonstrated inside each stage", () => {
    const stages = stageProgress(["introduce_yourself"]);
    expect(stages[0].achieved).toBe(1);
    expect(stages[0].total).toBe(3);
  });

  it("measures progress in capabilities, not in weeks", () => {
    expect(pathPercent([])).toBe(0);
    expect(pathPercent(CAPABILITIES.map((c) => c.key))).toBe(100);
    expect(pathPercent(["introduce_yourself"])).toBe(Math.round((1 / CAPABILITIES.length) * 100));
  });
});

describe("the week you are in", () => {
  const start = "2026-01-01T00:00:00.000Z";

  it("starts at one and never goes below it", () => {
    expect(weekOfPath(null)).toBe(1);
    expect(weekOfPath("not a date")).toBe(1);
    expect(weekOfPath(start, new Date("2026-01-01T12:00:00Z"))).toBe(1);
    expect(weekOfPath(start, new Date("2025-12-01T00:00:00Z"))).toBe(1);
  });

  it("turns over on the seventh day", () => {
    expect(weekOfPath(start, new Date("2026-01-07T23:00:00Z"))).toBe(1);
    expect(weekOfPath(start, new Date("2026-01-08T01:00:00Z"))).toBe(2);
    expect(weekOfPath(start, new Date("2026-03-26T00:00:00Z"))).toBe(13);
  });

  it("reads a timestamp stored without its zone, as the database writes them", () => {
    expect(weekOfPath("2026-01-01 00:00:00", new Date("2026-01-09T00:00:00Z"))).toBe(2);
  });
});

describe("saying the gap out loud", () => {
  it("tells somebody who is behind that they are, and that it is recoverable", () => {
    const verdict = pace(9, 10);
    expect(verdict.tone).toBe("behind");
    expect(verdict.text).toContain("si recupera");
  });

  it("does not scold somebody who is broadly on track", () => {
    expect(pace(6, timePercent(6)).tone).toBe("on");
    expect(pace(6, timePercent(6) - 10).tone).toBe("on");
  });

  it("notices somebody who is ahead", () => {
    expect(pace(3, 60).tone).toBe("ahead");
  });

  it("never says the path expired", () => {
    const over = pace(20, 30);
    expect(over.tone).toBe("over");
    expect(over.text).toContain("non scade");
    expect(pace(20, 95).text).toContain("mestiere");
  });
});

describe("il pagellino", () => {
  it("turns the running estimate into a mark anybody can read", () => {
    expect(markOf(0)).toBe(1);
    expect(markOf(50)).toBe(5);
    expect(markOf(65)).toBe(6.5);
    expect(markOf(100)).toBe(10);
  });

  it("never gives anybody a zero", () => {
    for (const value of [-50, 0, 1, 4]) expect(markOf(value)).toBeGreaterThanOrEqual(1);
  });

  it("survives a learner who has no estimates yet", () => {
    const marks = marksFrom(null);
    expect(marks).toHaveLength(8);
    expect(marks.every((m) => m.mark === 5)).toBe(true);
    expect(averageMark(marks)).toBe(5);
  });

  it("says what each mark means and what to do about it", () => {
    for (const mark of marksFrom({ listening: 30, speaking: 90 })) {
      expect(mark.meaning.length).toBeGreaterThan(10);
      expect(mark.advice.length).toBeGreaterThan(10);
      expect(mark.href).toMatch(/^\//);
    }
  });

  it("points at the two weakest, which is where the next sessions belong", () => {
    const marks = marksFrom({ listening: 20, speaking: 30, vocabulary: 90, grammar: 85 });
    expect(weakest(marks).map((m) => m.skill)).toEqual(["listening", "speaking"]);
  });
});

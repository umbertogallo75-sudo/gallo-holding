import { describe, expect, it } from "vitest";
import {
  buildRun,
  isRight,
  makeQuestion,
  normalise,
  QUESTIONS,
  sayDecimal,
  sayNumber,
  sayYear,
  verdict,
} from "@/lib/games/numbers";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe("saying a number in English", () => {
  it("says the small ones the way people do", () => {
    expect(sayNumber(0)).toBe("zero");
    expect(sayNumber(13)).toBe("thirteen");
    expect(sayNumber(15)).toBe("fifteen");
    expect(sayNumber(50)).toBe("fifty");
    expect(sayNumber(21)).toBe("twenty-one");
    expect(sayNumber(99)).toBe("ninety-nine");
  });

  it("handles hundreds and thousands with the 'and' where English wants it", () => {
    expect(sayNumber(100)).toBe("one hundred");
    expect(sayNumber(101)).toBe("one hundred and one");
    expect(sayNumber(250)).toBe("two hundred and fifty");
    expect(sayNumber(1000)).toBe("one thousand");
    expect(sayNumber(1500)).toBe("one thousand five hundred");
    expect(sayNumber(1005)).toBe("one thousand and five");
    expect(sayNumber(2400)).toBe("two thousand four hundred");
    expect(sayNumber(1_000_000)).toBe("one million");
  });

  it("says years in pairs, not as quantities", () => {
    expect(sayYear(1998)).toBe("nineteen ninety-eight");
    expect(sayYear(1900)).toBe("nineteen hundred");
    expect(sayYear(1905)).toBe("nineteen oh five");
    expect(sayYear(2005)).toBe("two thousand five");
    expect(sayYear(2026)).toBe("twenty twenty-six");
  });

  it("says a decimal digit by digit after the point", () => {
    expect(sayDecimal(1.5)).toBe("one point five");
    expect(sayDecimal(12.0)).toBe("twelve point zero");
    expect(sayDecimal(90.9)).toBe("ninety point nine");
  });

  it("never produces empty or malformed words, for any number it can ask", () => {
    for (let n = 0; n <= 10_000; n += 7) {
      const said = sayNumber(n);
      expect(said.trim(), String(n)).not.toBe("");
      expect(said, String(n)).not.toMatch(/undefined|NaN|\s\s/);
    }
    for (let y = 1960; y <= 2099; y += 1) {
      expect(sayYear(y), String(y)).not.toMatch(/undefined|NaN|\s\s/);
    }
  });
});

describe("accepting what the player types", () => {
  it("takes the number however it was punctuated", () => {
    expect(isRight("1500", "1500")).toBe(true);
    expect(isRight("1.500", "1500")).toBe(true);
    expect(isRight("1,500", "1500")).toBe(true);
    expect(isRight(" 1 500 ", "1500")).toBe(true);
    expect(isRight("€1.500", "1500")).toBe(true);
    expect(isRight("7,5", "7.5")).toBe(true);
    expect(isRight("7.5%", "7.5")).toBe(true);
    expect(isRight("07", "7")).toBe(true);
  });

  it("still says no when it is the wrong number", () => {
    expect(isRight("15", "50")).toBe(false);
    expect(isRight("150", "1500")).toBe(false);
    expect(isRight("", "1500")).toBe(false);
    expect(isRight("   ", "1500")).toBe(false);
    expect(isRight("abc", "1500")).toBe(false);
  });

  it("treats a trailing zero decimal as the whole number", () => {
    expect(normalise("12.0")).toBe("12");
    expect(isRight("12,0", "12")).toBe(true);
  });
});

describe("a run of questions", () => {
  it("asks the right number of distinct questions, all answerable", () => {
    const run = buildRun(seeded(9));
    expect(run).toHaveLength(QUESTIONS);
    expect(new Set(run.map((q) => q.answer)).size).toBe(QUESTIONS);
    for (const question of run) {
      expect(question.spoken.trim()).not.toBe("");
      expect(question.written.trim()).not.toBe("");
      expect(question.context.trim()).not.toBe("");
      // The answer must be exactly what typing it back would produce.
      expect(isRight(question.answer, question.answer)).toBe(true);
      expect(question.spoken).not.toMatch(/undefined|NaN/);
    }
  });

  it("mixes the kinds instead of asking ten of the same", () => {
    const kinds = new Set(buildRun(seeded(2)).map((q) => q.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });

  it("keeps years inside the years, and percentages inside the percentages", () => {
    const random = seeded(31);
    for (let i = 0; i < 300; i += 1) {
      const question = makeQuestion(random, i);
      const value = Number(question.answer);
      if (question.kind === "year") {
        expect(value).toBeGreaterThanOrEqual(1960);
        expect(value).toBeLessThanOrEqual(2026);
      }
      if (question.kind === "percent") expect(value).toBeLessThanOrEqual(49);
      expect(Number.isNaN(value)).toBe(false);
    }
  });

  it("says something different about ten right and two right", () => {
    expect(verdict(10, 10)).not.toBe(verdict(2, 10));
  });
});

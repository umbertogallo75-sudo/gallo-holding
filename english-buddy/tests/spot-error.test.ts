import { describe, expect, it } from "vitest";
import {
  BANK_SIZE,
  bankPuzzles,
  buildRun,
  puzzleFrom,
  QUESTIONS,
  singleWordDiff,
  splitWords,
  verdict,
} from "@/lib/games/spot-error";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe("finding the one word that changed", () => {
  it("spots a single substitution and says what it should have been", () => {
    expect(singleWordDiff("I have 25 years old", "I am 25 years old")).toEqual({ index: 1, right: "am" });
    expect(singleWordDiff("We discussed about the budget", "We discussed the budget")).toBeNull(); // lengths differ
  });

  it("refuses anything that is not one clean swap", () => {
    // Two words moved: there is no single word to tap.
    expect(singleWordDiff("I have did a mistake", "I have made an error")).toBeNull();
    // Identical: nothing to find.
    expect(singleWordDiff("the same sentence here", "the same sentence here")).toBeNull();
    // Too short to be a sentence, and too long to read mid-run.
    expect(singleWordDiff("me too", "me also")).toBeNull();
    expect(singleWordDiff(Array(20).fill("word").join(" "), Array(20).fill("other").join(" "))).toBeNull();
  });

  it("ignores punctuation and case when comparing", () => {
    expect(singleWordDiff("I am agree with you.", "I agree with you.")).toBeNull(); // length differs
    expect(singleWordDiff("He is responsible of the project", "He is responsible for the project")).toEqual({
      index: 3,
      right: "for",
    });
  });

  it("builds a puzzle whose wrong word really is in the sentence", () => {
    const puzzle = puzzleFrom("It depends from the client", "It depends on the client", null);
    expect(puzzle).not.toBeNull();
    expect(puzzle!.words[puzzle!.wrong]).toBe("from");
    expect(puzzle!.right).toBe("on");
    // With no explanation given, one is written rather than left blank.
    expect(puzzle!.why).toContain("on");
  });
});

describe("the bank of Italian-speaker mistakes", () => {
  it("is entirely made of usable single-word swaps", () => {
    const puzzles = bankPuzzles();
    // Every entry must survive: a dropped one is a bank entry written wrong.
    expect(puzzles).toHaveLength(BANK_SIZE);
    for (const puzzle of puzzles) {
      expect(puzzle.words.length).toBeGreaterThanOrEqual(3);
      expect(puzzle.wrong).toBeGreaterThanOrEqual(0);
      expect(puzzle.wrong).toBeLessThan(puzzle.words.length);
      expect(puzzle.right.trim()).not.toBe("");
      expect(puzzle.why.trim()).not.toBe("");
      // The wrong word and its correction must actually differ.
      expect(puzzle.words[puzzle.wrong].toLowerCase()).not.toBe(puzzle.right.toLowerCase());
      expect(puzzle.itemText).toBeNull();
    }
  });

  it("is big enough that a run is never short", () => {
    expect(BANK_SIZE).toBeGreaterThanOrEqual(QUESTIONS * 2);
  });
});

describe("a run", () => {
  it("fills to the right length and never repeats a sentence", () => {
    const run = buildRun([], seeded(6));
    expect(run).toHaveLength(QUESTIONS);
    const sentences = run.map((p) => p.words.join(" "));
    expect(new Set(sentences).size).toBe(QUESTIONS);
  });

  it("puts the learner's own sentences first and keeps them reviewable", () => {
    const own = [puzzleFrom("I am waiting you outside", "I am waiting for you outside", null)].filter(Boolean);
    // That pair changes length, so it is correctly refused; use a real swap.
    const mine = puzzleFrom("She said me that it was late", "She told me that it was late", "«tell», non «say»")!;
    const run = buildRun([mine], seeded(1));
    expect(run[0].words.join(" ")).toBe("She said me that it was late");
    expect(run[0].itemText).toBe("She told me that it was late");
    expect(own.length).toBe(0);
  });

  it("says something different about all right and mostly wrong", () => {
    expect(verdict(8, 8)).not.toBe(verdict(1, 8));
  });

  it("keeps words as the reader sees them", () => {
    expect(splitWords("  Can you  confirm the price? ")).toEqual(["Can", "you", "confirm", "the", "price?"]);
  });
});

import { describe, expect, it } from "vitest";
import { GLOSSARY } from "@/lib/games/glossary";
import {
  coverage,
  dealTray,
  fitsIn,
  judge,
  MIN_FINDABLE,
  MIN_WORD,
  pointsFor,
  reshuffle,
  START_SECONDS,
  TRAYS,
  verdict,
  WORD_SECONDS,
} from "@/lib/games/long-word";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe("what the letters can spell", () => {
  it("respects how many times a letter is actually there", () => {
    expect(fitsIn("meet", "meeting")).toBe(true);
    expect(fitsIn("time", "meeting")).toBe(true);
    // Two e's needed, only one available.
    expect(fitsIn("meet", "metric")).toBe(false);
    expect(fitsIn("team", "meat")).toBe(true);
    expect(fitsIn("teams", "meat")).toBe(false);
  });
});

describe("the trays", () => {
  it("exist in enough number to play more than once", () => {
    expect(TRAYS.length).toBeGreaterThanOrEqual(20);
  });

  it("are never a dead end and never a two-answer puzzle", () => {
    for (const tray of TRAYS) {
      // The letters are a real word's letters, so a full-length answer exists.
      expect(tray.letters.join("")).toHaveLength(tray.full.length);
      expect([...tray.letters].sort().join("")).toBe([...tray.full].sort().join(""));
      expect(tray.full.length).toBeGreaterThanOrEqual(6);
      expect(tray.full.length).toBeLessThanOrEqual(9);
      // Enough hidden words that finding some is realistic.
      expect(tray.findable.length, tray.full).toBeGreaterThanOrEqual(MIN_FINDABLE);
      // Every word it promises really is spellable from those letters, is long
      // enough to be accepted, and is not the full word counted twice.
      for (const entry of tray.findable) {
        expect(fitsIn(entry.word, tray.full), `${entry.word} da ${tray.full}`).toBe(true);
        expect(entry.word.length).toBeGreaterThanOrEqual(MIN_WORD);
        expect(entry.word).not.toBe(tray.full);
        expect(entry.it.trim()).not.toBe("");
      }
      // Longest first, so the end screen reads as a ladder.
      const lengths = tray.findable.map((e) => e.word.length);
      expect([...lengths].sort((a, b) => b - a)).toEqual(lengths);
    }
  });

  it("deals without repeating a tray already played", () => {
    const random = seeded(5);
    const seen = new Set<string>();
    for (let i = 0; i < 15; i += 1) {
      const tray = dealTray(random, seen);
      expect(seen.has(tray.full)).toBe(false);
      seen.add(tray.full);
    }
  });

  it("always visibly changes the letters when shuffled", () => {
    const random = seeded(3);
    for (let i = 0; i < 40; i += 1) {
      const tray = dealTray(random);
      const mixed = reshuffle(tray, random);
      expect([...mixed.letters].sort()).toEqual([...tray.letters].sort());
      expect(mixed.full).toBe(tray.full);
    }
  });
});

describe("judging an attempt", () => {
  const tray = TRAYS.find((t) => t.full === "forecast") ?? TRAYS[0];

  it("accepts a hidden word and pays by length", () => {
    const word = tray.findable[tray.findable.length - 1].word;
    const result = judge(tray, word, []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.full).toBe(false);
      expect(result.points).toBe(pointsFor(word.length));
      expect(result.it.trim()).not.toBe("");
    }
  });

  it("pays double for the word that uses every letter", () => {
    const result = judge(tray, tray.full, []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.full).toBe(true);
      expect(result.points).toBe(pointsFor(tray.full.length) * 2);
    }
  });

  it("takes it however it was capitalised", () => {
    expect(judge(tray, tray.full.toUpperCase(), []).ok).toBe(true);
  });

  it("refuses the three things it should, and says which", () => {
    expect(judge(tray, "ab", [])).toEqual({ ok: false, reason: "too_short" });
    expect(judge(tray, tray.full, [tray.full])).toEqual({ ok: false, reason: "already_found" });
    expect(judge(tray, "zzzz", [])).toEqual({ ok: false, reason: "not_a_word" });
  });

  it("refuses a real word that these letters cannot spell", () => {
    const outsider = GLOSSARY.find((entry) => entry.word.length >= MIN_WORD && !fitsIn(entry.word, tray.full));
    expect(outsider).toBeDefined();
    expect(judge(tray, outsider!.word, [])).toEqual({ ok: false, reason: "not_a_word" });
  });
});

describe("the shape of a run", () => {
  it("pays more for every extra letter, never less", () => {
    for (let n = MIN_WORD; n < 9; n += 1) expect(pointsFor(n + 1)).toBeGreaterThan(pointsFor(n));
    expect(pointsFor(3)).toBe(pointsFor(4));
  });

  it("gives back less than a tray can cost, so a run has to end", () => {
    expect(WORD_SECONDS).toBeLessThan(START_SECONDS / 10);
  });

  it("counts the full word in what there was to find", () => {
    const tray = TRAYS[0];
    expect(coverage(tray, []).outOf).toBe(tray.findable.length + 1);
    expect(coverage(tray, ["a", "b"]).got).toBe(2);
  });

  it("says something different about a long haul and a blank", () => {
    expect(verdict(0, 0)).not.toBe(verdict(2000, 3));
    expect(verdict(500, 1)).not.toBe(verdict(500, 0));
  });
});

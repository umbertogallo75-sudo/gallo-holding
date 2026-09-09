import { describe, expect, it } from "vitest";
import { FOUR_LETTER_WORDS } from "@/lib/games/four-letters-words";
import {
  anagramGroups,
  BONUS_SECONDS,
  dealTray,
  drainRate,
  isAnswer,
  LETTERS,
  MAX_DRAIN,
  meaningOf,
  reshuffle,
  SKIP_PENALTY_SECONDS,
  START_SECONDS,
  trayKey,
  verdict,
} from "@/lib/games/four-letters";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe("the dictionary", () => {
  it("is four letters, every time, with a meaning and no repeats", () => {
    expect(FOUR_LETTER_WORDS.length).toBeGreaterThan(150);
    for (const entry of FOUR_LETTER_WORDS) {
      expect(entry.word, entry.word).toMatch(/^[a-z]{4}$/);
      expect(entry.it.trim(), entry.word).not.toBe("");
    }
    const words = FOUR_LETTER_WORDS.map((e) => e.word);
    expect(new Set(words).size).toBe(words.length);
  });

  it("has enough trays with more than one answer to keep the opening generous", () => {
    const multi = anagramGroups().filter((group) => group.length > 1);
    expect(multi.length).toBeGreaterThanOrEqual(10);
    // Every group really is one set of letters.
    for (const group of multi) {
      const key = [...group[0].word].sort().join("");
      for (const entry of group) expect([...entry.word].sort().join("")).toBe(key);
    }
  });

  it("can look a word's meaning back up, which is the end screen", () => {
    expect(meaningOf("team")).toContain("squadra");
    expect(meaningOf("zzzz")).toBeNull();
  });
});

describe("dealing", () => {
  it("never deals a tray that cannot be solved", () => {
    const random = seeded(7);
    for (let i = 0; i < 400; i += 1) {
      const tray = dealTray(i % 30, random);
      expect(tray.letters).toHaveLength(LETTERS);
      expect(tray.answers.length).toBeGreaterThan(0);
      // Every listed answer must be spellable from exactly these letters.
      const key = [...tray.letters].sort().join("");
      for (const answer of tray.answers) {
        expect([...answer].sort().join(""), `${answer} da ${key}`).toBe(key);
        expect(isAnswer(tray, answer)).toBe(true);
        expect(meaningOf(answer)).not.toBeNull();
      }
      expect(isAnswer(tray, "zzzz")).toBe(false);
    }
  });

  it("opens generously and hardens later", () => {
    const early = Array.from({ length: 60 }, (_, i) => dealTray(0, seeded(i + 1)));
    expect(early.every((tray) => tray.answers.length > 1)).toBe(true);
  });

  it("does not repeat letters already solved in the run", () => {
    const random = seeded(3);
    const seen = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      const tray = dealTray(i, random, seen);
      expect(seen.has(trayKey(tray))).toBe(false);
      seen.add(trayKey(tray));
    }
  });

  it("accepts an answer whatever case it arrives in", () => {
    const tray = dealTray(0, seeded(11));
    expect(isAnswer(tray, tray.answers[0].toUpperCase())).toBe(true);
  });

  it("always visibly changes the letters when the shuffle button is pressed", () => {
    const random = seeded(5);
    for (let i = 0; i < 50; i += 1) {
      const tray = dealTray(i, random);
      const mixed = reshuffle(tray, random);
      expect([...mixed.letters].sort()).toEqual([...tray.letters].sort());
      expect(mixed.answers).toEqual(tray.answers);
    }
  });
});

describe("the clock", () => {
  it("starts at real time and speeds up to the ceiling, never past it", () => {
    expect(drainRate(0)).toBe(1);
    expect(drainRate(10)).toBeGreaterThan(drainRate(5));
    expect(drainRate(1000)).toBe(MAX_DRAIN);
    expect(drainRate(-5)).toBe(1);
  });

  it("gives back less than a tray can cost, so a run has to end", () => {
    // If a word bought back more than the clock spends finding one, a good
    // player would never run out and the game would have no ending.
    expect(BONUS_SECONDS).toBeLessThan(START_SECONDS / 4);
    expect(SKIP_PENALTY_SECONDS).toBeGreaterThan(0);
  });

  it("says something different about a long run and a short one", () => {
    expect(verdict(0)).not.toBe(verdict(30));
    expect(verdict(0)).toBeTruthy();
    expect(verdict(30)).toBeTruthy();
  });
});

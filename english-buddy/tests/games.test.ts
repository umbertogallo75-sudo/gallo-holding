import { describe, expect, it } from "vitest";
import { GAMES, findGame, LIVE_GAMES } from "@/lib/games/catalog";
import { bankWords, BANK_SIZE } from "@/lib/games/bank";
import { dedupe, extractWord, MAX_LETTERS, MIN_LETTERS, safeHint, type GameWord } from "@/lib/games/words";
import {
  BASE_POINTS,
  buildRound,
  decoyCount,
  MAX_STREAK_BONUS,
  MAX_TRAY,
  ROUNDS_PER_GAME,
  roundScore,
  shuffle,
  traySpells,
  verdict,
} from "@/lib/games/word-sprint";

/** Deterministic randomness, so a round can be rebuilt exactly. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe("games catalogue", () => {
  it("has unique slugs and no game claims to be live without a page", () => {
    const slugs = GAMES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(LIVE_GAMES.length).toBeGreaterThan(0);
    for (const game of LIVE_GAMES) expect(findGame(game.slug)).toEqual(game);
    expect(findGame("does-not-exist")).toBeNull();
  });
});

describe("word extraction", () => {
  it("takes the longest usable word out of a phrase", () => {
    expect(extractWord("to touch base")).toBe("touch");
    expect(extractWord("I have 25 years")).toBe("years");
    expect(extractWord("we need to leverage this")).toBe("leverage");
  });

  it("refuses what cannot be played", () => {
    expect(extractWord("I am ok")).toBeNull(); // nothing long enough
    expect(extractWord("")).toBeNull();
    expect(extractWord("123 456")).toBeNull();
    // Nine letters is the ceiling: a longer word would not fit the tray.
    expect(extractWord("internationalisation")).toBeNull();
  });

  it("never hands back a clue containing the answer", () => {
    expect(safeHint("the budget for the year", "budget", "ripiego")).toBe("ripiego");
    expect(safeHint("BUDGET in maiuscolo", "budget", "ripiego")).toBe("ripiego");
    expect(safeHint("le risorse assegnate", "budget", "ripiego")).toBe("le risorse assegnate");
    expect(safeHint(null, "budget", "ripiego")).toBe("ripiego");
    expect(safeHint("   ", "budget", "ripiego")).toBe("ripiego");
  });

  it("drops duplicates and unplayable entries, keeping order", () => {
    const input: GameWord[] = [
      { word: "budget", hint: "a", source: "mistake", itemText: "budget" },
      { word: "budget", hint: "b", source: "bank", itemText: null },
      { word: "ok", hint: "c", source: "bank", itemText: null },
      { word: "año", hint: "d", source: "bank", itemText: null },
      { word: "target", hint: "e", source: "bank", itemText: null },
    ];
    expect(dedupe(input).map((w) => w.word)).toEqual(["budget", "target"]);
    // The first one wins, so the learner's own word beats the bank copy.
    expect(dedupe(input)[0].source).toBe("mistake");
  });
});

describe("the word bank", () => {
  it("only offers words a game can actually use", () => {
    const all = bankWords(BANK_SIZE, 0);
    expect(all).toHaveLength(BANK_SIZE);
    for (const entry of all) {
      expect(entry.word).toMatch(/^[a-z]+$/);
      expect(entry.word.length).toBeGreaterThanOrEqual(MIN_LETTERS);
      expect(entry.word.length).toBeLessThanOrEqual(MAX_LETTERS);
      // A clue that contains its own answer makes the round free.
      expect(entry.hint.toLowerCase()).not.toContain(entry.word);
      expect(entry.itemText).toBeNull();
    }
    expect(new Set(all.map((e) => e.word)).size).toBe(BANK_SIZE);
  });

  it("is big enough to fill a game and rotates with the seed", () => {
    expect(BANK_SIZE).toBeGreaterThanOrEqual(ROUNDS_PER_GAME * 2);
    expect(bankWords(3, 0)[0].word).not.toBe(bankWords(3, 7)[0].word);
    // Asking for more than exists must not loop forever or repeat.
    expect(bankWords(BANK_SIZE + 50, 3)).toHaveLength(BANK_SIZE);
  });
});

describe("building a round", () => {
  it("always deals a tray that can spell the word", () => {
    const random = seeded(42);
    for (const word of ["budget", "deal", "handover", "stakeholder".slice(0, 9)]) {
      const round = buildRound({ word, hint: "x", source: "bank", itemText: null }, random);
      expect(traySpells(round.tray, round.word)).toBe(true);
      expect(round.tray.length).toBe(word.length + decoyCount(word.length));
      expect(round.tray.length).toBeLessThanOrEqual(MAX_TRAY);
      for (const letter of round.tray) expect(letter).toMatch(/^[a-z]$/);
    }
  });

  it("carries the review identity through untouched", () => {
    const round = buildRound({ word: "budget", hint: "clue", source: "mistake", itemText: "the budget" }, seeded(1));
    expect(round).toMatchObject({ source: "mistake", itemText: "the budget", hint: "clue" });
  });

  it("shuffles without losing or inventing letters", () => {
    const letters = "abcdefgh".split("");
    const mixed = shuffle(letters, seeded(9));
    expect([...mixed].sort()).toEqual([...letters].sort());
    expect(letters).toEqual("abcdefgh".split("")); // input untouched
  });

  it("spots a tray that cannot spell the word", () => {
    expect(traySpells(["b", "u", "d", "g", "e"], "budget")).toBe(false);
    // Repeated letters need to be there twice.
    expect(traySpells(["l", "e", "v", "r", "a", "g"], "leverage")).toBe(false);
  });
});

describe("scoring", () => {
  it("rewards the clock and the streak, and never goes backwards", () => {
    expect(roundScore(0, 0)).toBe(BASE_POINTS);
    expect(roundScore(10, 0)).toBeGreaterThan(roundScore(5, 0));
    expect(roundScore(5, 3)).toBeGreaterThan(roundScore(5, 0));
    // A long run cannot run away with the game.
    expect(roundScore(0, 99) - BASE_POINTS).toBe(MAX_STREAK_BONUS);
    // Nonsense in, sane out: a negative clock is worth nothing, not a penalty.
    expect(roundScore(-5, -3)).toBe(BASE_POINTS);
  });

  it("says something true at the end of every game", () => {
    expect(verdict(0, 0)).toContain("Nessuna");
    expect(verdict(8, 8)).toBeTruthy();
    expect(verdict(1, 8)).toBeTruthy();
    expect(verdict(8, 8)).not.toBe(verdict(1, 8));
  });
});

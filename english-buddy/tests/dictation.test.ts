import { describe, expect, it } from "vitest";
import {
  ACCENTS,
  buildGame,
  isAccent,
  judge,
  levelOf,
  MAX_LEVEL,
  nextLevel,
  SENTENCES_PER_GAME,
  verdict,
  words,
} from "@/lib/games/dictation";
import { delivery, type TtsLang } from "@/lib/tts-request";

/**
 * "Lo renderei un gioco. Toglierei la parte del microfono perché se no il nome
 * perde di significato. Darei un tempo limite per scrivere e darei un limite
 * di dieci frasi per partita... Se fai 10 su 10 alla partita successiva si
 * alza il livello. La figata assurda sarebbe avere più accenti."
 */
describe("a game, not a chat mode", () => {
  it("deals ten sentences", () => {
    expect(buildGame(3, Math.random)).toHaveLength(SENTENCES_PER_GAME);
  });

  it("opens with something from the level below, so it starts in the hand", () => {
    const rounds = buildGame(4, () => 0.5);
    expect(rounds[0].level).toBeLessThan(4);
    expect(rounds.some((round) => round.level === 4)).toBe(true);
  });

  it("has no easier level to borrow from at level one", () => {
    expect(buildGame(1, Math.random).every((round) => round.level === 1)).toBe(true);
  });

  it("never deals the same sentence twice in one game", () => {
    const sentences = buildGame(2, Math.random).map((round) => round.sentence);
    expect(new Set(sentences).size).toBe(sentences.length);
  });
});

describe("marking a dictation", () => {
  it("counts the words caught, not pass or fail", () => {
    // All-or-nothing tells somebody who caught nine words out of ten exactly
    // the same thing as somebody who caught none.
    const result = judge("The meeting starts at ten.", "the meeting starts at two");
    expect(result.perfect).toBe(false);
    expect(result.share).toBeCloseTo(4 / 5, 2);
    expect(result.missed).toEqual(["ten"]);
    expect(result.points).toBeGreaterThan(0);
  });

  it("forgives capitals and punctuation, which are not the exercise", () => {
    expect(judge("Can you send me the file?", "can you send me the file").perfect).toBe(true);
    expect(judge("I would like a coffee.", "I WOULD LIKE A COFFEE!").perfect).toBe(true);
  });

  it("does not call a sentence perfect when words were added", () => {
    expect(judge("See you on Monday.", "see you on Monday please").perfect).toBe(false);
  });

  it("pays the clock only for a sentence actually caught", () => {
    const rushed = judge("The office is closed today.", "aaa bbb ccc", 25);
    const earned = judge("The office is closed today.", "the office is closed today", 25);
    expect(rushed.points).toBeLessThan(earned.points);
    expect(earned.points).toBeGreaterThan(judge("The office is closed today.", "the office is closed today", 0).points);
  });

  it("reads apostrophes the way people type them", () => {
    expect(words("Let us park that — let’s")).toContain("let's");
  });
});

describe("the level", () => {
  it("moves only when every sentence was perfect", () => {
    expect(nextLevel(2, 10, 10)).toBe(3);
    expect(nextLevel(2, 9, 10)).toBe(2);
  });

  it("does not move on a short game", () => {
    expect(nextLevel(2, 3, 3)).toBe(2);
  });

  it("stops at the top and never goes below one", () => {
    expect(nextLevel(MAX_LEVEL, 10, 10)).toBe(MAX_LEVEL);
    expect(levelOf(0)).toBe(1);
    expect(levelOf(99)).toBe(MAX_LEVEL);
  });

  it("says when it went up", () => {
    expect(verdict(10, 10, true)).toContain("Livello superato");
    expect(verdict(5, 10, false)).not.toContain("Livello superato");
  });
});

describe("the accents", () => {
  it("offers the ones a learner actually has to deal with", () => {
    expect(ACCENTS.map((a) => a.key)).toEqual(["en-GB", "en-US", "en-AU", "en-IE", "en-SCT"]);
    expect(ACCENTS.every((a) => a.flag && a.label && a.note)).toBe(true);
  });

  it("refuses anything that is not one of them", () => {
    expect(isAccent("en-GB")).toBe(true);
    expect(isAccent("it-IT")).toBe(false);
    expect(isAccent(null)).toBe(false);
  });

  it("reaches the voice, each one named", () => {
    for (const accent of ACCENTS) {
      const note = delivery(false, accent.key as TtsLang);
      expect(note, accent.key).toMatch(/Accent: .+English/);
    }
    expect(delivery(false, "en-SCT")).toContain("Scottish");
    expect(delivery(false, "en-AU")).toContain("Australian");
    // Never a caricature: it is a pronunciation model, not an impression.
    expect(delivery(false, "en-IE")).toContain("never a caricature");
  });
});

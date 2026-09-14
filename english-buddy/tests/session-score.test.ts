import { describe, expect, it } from "vitest";
import { FULL_EXCHANGES, MIN_EXCHANGES, scoreSession, shouldWrapUp } from "@/lib/learning/session-score";

const base = { exchanges: 0, corrected: 0, learned: 0, minutes: 0 };

describe("scoring a session", () => {
  it("never punishes somebody for turning up", () => {
    expect(scoreSession({ ...base, exchanges: 1 }).points).toBeGreaterThan(0);
    expect(scoreSession(base).points).toBe(0);
    for (const exchanges of [0, 1, 5, 12, 40]) {
      const score = scoreSession({ ...base, exchanges, corrected: exchanges, learned: 0 });
      expect(score.points).toBeGreaterThanOrEqual(0);
      expect(score.points).toBeLessThanOrEqual(100);
    }
  });

  it("rewards saying more, which is the whole point", () => {
    const quiet = scoreSession({ ...base, exchanges: 3 });
    const talkative = scoreSession({ ...base, exchanges: 12 });
    expect(talkative.points).toBeGreaterThan(quiet.points);
  });

  it("never lets silence beat effort", () => {
    // The trap a naive accuracy score falls into: somebody who says three safe
    // sentences perfectly must not beat somebody who says twelve and gets half
    // of them corrected, or the lesson is "do not try".
    const safe = scoreSession({ ...base, exchanges: 3, corrected: 0 });
    const brave = scoreSession({ ...base, exchanges: 12, corrected: 6 });
    expect(brave.points).toBeGreaterThan(safe.points);
  });

  it("treats a correction as a lesson, not a failure", () => {
    const clean = scoreSession({ ...base, exchanges: 10, corrected: 0 });
    const corrected = scoreSession({ ...base, exchanges: 10, corrected: 10 });
    // It costs something, or the number would mean nothing — but never much.
    expect(clean.points).toBeGreaterThan(corrected.points);
    expect(clean.points - corrected.points).toBeLessThanOrEqual(20);
  });

  it("counts what they took away", () => {
    const empty = scoreSession({ ...base, exchanges: 8 });
    const learned = scoreSession({ ...base, exchanges: 8, learned: 3 });
    expect(learned.points).toBeGreaterThan(empty.points);
    // More than three adds nothing: a session is not a vocabulary dump.
    expect(scoreSession({ ...base, exchanges: 8, learned: 30 }).points).toBe(learned.points);
  });

  it("says something true and specific at every level", () => {
    for (const exchanges of [1, 3, 6, 12, 25]) {
      const score = scoreSession({ ...base, exchanges, learned: 1 });
      expect(score.headline.trim()).not.toBe("");
      expect(score.detail.trim()).not.toBe("");
      expect(score.stars).toBeGreaterThanOrEqual(exchanges >= MIN_EXCHANGES ? 1 : 0);
      expect(score.stars).toBeLessThanOrEqual(5);
    }
    // A session too short to count says so, instead of flattering.
    expect(scoreSession({ ...base, exchanges: 1 }).headline).toContain("Appena");
  });

  it("survives impossible numbers rather than producing nonsense", () => {
    expect(scoreSession({ ...base, exchanges: -5, corrected: -2, learned: -1 }).points).toBe(0);
    // More corrections than messages cannot happen, and must not break it.
    const score = scoreSession({ ...base, exchanges: 2, corrected: 99 });
    expect(score.points).toBeGreaterThanOrEqual(0);
    expect(score.points).toBeLessThanOrEqual(100);
  });
});

describe("knowing when to stop", () => {
  it("wraps up once the conversation has done its job", () => {
    expect(shouldWrapUp(FULL_EXCHANGES - 1)).toBe(false);
    expect(shouldWrapUp(FULL_EXCHANGES)).toBe(true);
  });

  it("does not end a session before it has begun", () => {
    expect(shouldWrapUp(0)).toBe(false);
    expect(MIN_EXCHANGES).toBeLessThan(FULL_EXCHANGES);
  });
});

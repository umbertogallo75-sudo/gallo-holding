import { describe, expect, it } from "vitest";
import { COACH_MODES, MODE_MINUTES } from "@/lib/learning/modes";
import { pickFirstSession } from "@/lib/learning/first-session";

const LEVELS = ["zero", "basics", "independent", "business", "advanced"];
const GOALS = ["Riunioni e call", "Viaggi di lavoro", "Trattative e clienti", "Colloqui", ""];
const MINUTES = [2, 5, 10];

/**
 * The bug this exists to prevent, because it already happened: the chooser
 * could pick "negotiation" for an advanced sales profile, the API's schema had
 * never heard of the word, and the very first session those users ever
 * attempted was rejected before it started. Two lists that had to agree, with
 * nothing making them agree.
 */
describe("the modes the first session can choose", () => {
  it("are all modes the coach API will accept", () => {
    const chosen = new Set<string>();
    for (const level of LEVELS) {
      for (const goal of GOALS) {
        for (const minutes of MINUTES) {
          chosen.add(pickFirstSession(level, goal, minutes).mode);
        }
      }
    }
    expect(chosen.size).toBeGreaterThan(3);
    for (const mode of chosen) {
      expect(COACH_MODES as readonly string[], `"${mode}" scelto ma non accettato dall'API`).toContain(mode);
    }
  });

  it("all have a duration, so practice minutes are never guessed", () => {
    for (const mode of COACH_MODES) {
      expect(MODE_MINUTES[mode], mode).toBeGreaterThan(0);
    }
  });

  it("keeps the free level check in the list", () => {
    // It is the one mode the paywall lets through by name; removing it from
    // here would make the landing page's free test unreachable.
    expect(COACH_MODES as readonly string[]).toContain("levelcheck");
  });
});

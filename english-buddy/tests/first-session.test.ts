import { describe, expect, it } from "vitest";
import { pickFirstSession } from "@/lib/learning/first-session";

/**
 * The table that replaced the question "what can you do right now?". If it
 * ever returns something a learner cannot do, the home screen is back to
 * being a menu — just a menu with one item.
 */
describe("pickFirstSession", () => {
  it("keeps a true beginner on the guided path whatever their goal", () => {
    for (const goal of ["Riunioni e call", "Trattative e clienti", "Viaggi di lavoro"]) {
      expect(pickFirstSession("zero", goal, 15).mode, goal).toBe("zero");
      expect(pickFirstSession("basics", goal, 15).mode, goal).toBe("zero");
    }
  });

  it("never asks a beginner to role-play a negotiation", () => {
    expect(pickFirstSession("zero", "Trattative e clienti", 15).mode).not.toBe("negotiation");
    expect(pickFirstSession("basics", "Trattative e clienti", 15).mode).not.toBe("negotiation");
  });

  it("sends travellers to the practical scenes", () => {
    expect(pickFirstSession("independent", "Viaggi di lavoro", 5).mode).toBe("essentials");
  });

  it("gives the negotiation only to somebody with a base", () => {
    expect(pickFirstSession("business", "Trattative e clienti", 5).mode).toBe("negotiation");
    expect(pickFirstSession("independent", "Trattative e clienti", 5).mode).toBe("mission");
  });

  it("sizes the conversation to the minutes actually offered", () => {
    expect(pickFirstSession("independent", "Riunioni e call", 2).mode).toBe("text-2");
    expect(pickFirstSession("independent", "Riunioni e call", 5).mode).toBe("text-5");
    expect(pickFirstSession("independent", "Riunioni e call", 15).mode).toBe("guided");
  });

  it("still answers when nothing was ever chosen", () => {
    const pick = pickFirstSession(null, null, 5);
    expect(pick.mode).toBeTruthy();
    expect(pick.title).toBeTruthy();
    expect(pick.why).toBeTruthy();
  });
});

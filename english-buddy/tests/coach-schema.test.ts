import { describe, expect, it } from "vitest";
import { coachResultSchema } from "@/lib/ai/types";

describe("coach result schema", () => {
  it("parses a full structured response", () => {
    const result = coachResultSchema.parse({
      reply: "Good point. Why do you think margins matter more here?",
      correction: "Say 'I agree', not 'I am agree'.",
      mistakes: [{ incorrect: "I am agree", correct: "I agree", category: "grammar", severity: "meaningful", note: "'Agree' is a verb." }],
      expressions: [{ expression: "From my perspective", meaning: "Dal mio punto di vista" }],
      reviewed_items: [{ text: "I agree", success: true }],
      skill_updates: { grammar: 1, fluency: 0 },
    });
    expect(result.mistakes[0].category).toBe("grammar");
    expect(result.reviewed_items[0].success).toBe(true);
  });

  it("fills defaults for a minimal reply", () => {
    const result = coachResultSchema.parse({ reply: "Hello!" });
    expect(result.mistakes).toEqual([]);
    expect(result.expressions).toEqual([]);
    expect(result.reviewed_items).toEqual([]);
    expect(result.correction).toBe("");
  });

  it("coerces unknown categories to 'other' instead of failing the turn", () => {
    const result = coachResultSchema.parse({
      reply: "ok",
      mistakes: [{ incorrect: "x", correct: "y", category: "spelling", severity: "huge" }],
    });
    expect(result.mistakes[0].category).toBe("other");
    expect(result.mistakes[0].severity).toBe("minor");
  });

  it("rejects a response without a reply", () => {
    expect(() => coachResultSchema.parse({ correction: "" })).toThrow();
  });
});

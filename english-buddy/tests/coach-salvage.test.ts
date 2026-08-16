import { describe, expect, it } from "vitest";
import { salvageReply } from "@/lib/ai/openai";

/**
 * The case these cover is the one that reached production: a coach turn cut
 * off mid-object, whose raw text was then shown to the learner as if Sam had
 * said it.
 */
describe("salvageReply", () => {
  it("recovers the reply from an answer truncated mid-object", () => {
    const truncated =
      '{"reply":"Great start, Umberto! I\'m Sam.\\nCorrect sentence: I invest in real estate.",' +
      '"correction":"Say: \\u201cI invest in real estate.\\u201d","mistakes":[{"incorrect":"I invest real estate",' +
      '"correct":"I invest in real estate","category":"preposition","severity":"mean';
    expect(salvageReply(truncated)).toBe("Great start, Umberto! I'm Sam.\nCorrect sentence: I invest in real estate.");
  });

  it("keeps escaped quotes and newlines intact", () => {
    const raw = '{"reply":"Try: \\"I work as a CEO\\".\\nYour turn.","correction":""}';
    expect(salvageReply(raw)).toBe('Try: "I work as a CEO".\nYour turn.');
  });

  it("returns null when there is no reply to recover", () => {
    expect(salvageReply('{"correction":"Say it again","mistakes":[]}')).toBeNull();
    expect(salvageReply("not json at all")).toBeNull();
    expect(salvageReply("")).toBeNull();
  });

  it("returns null for an empty reply rather than an empty bubble", () => {
    expect(salvageReply('{"reply":"","correction":"x"}')).toBeNull();
    expect(salvageReply('{"reply":"   ","correction":"x"}')).toBeNull();
  });

  it("stops at the end of the reply and never swallows the rest", () => {
    const raw = '{"reply":"Hello.","correction":"Say hello","mistakes":[]}';
    const recovered = salvageReply(raw);
    expect(recovered).toBe("Hello.");
    expect(recovered).not.toContain("correction");
    expect(recovered).not.toContain("mistakes");
  });
});

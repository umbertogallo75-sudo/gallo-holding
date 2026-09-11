import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The rule this exists to protect, learned from a real session.
 *
 * A learner asked Sam for help in Italian. Sam helped — and then carried on in
 * Italian, for the rest of the conversation. Both prompts said when Italian was
 * allowed; neither said it had to be given back. So the coach drifted into
 * being an Italian-speaking companion, which is the one thing an English coach
 * must never become: the measure of a session is how much English came out of
 * the learner's mouth.
 *
 * Prompts are edited often and by hand. These two checks are cheap, and the
 * failure they catch is invisible — nothing breaks, the app simply stops
 * teaching.
 */
const VOICE = readFileSync(join(__dirname, "..", "src", "app", "api", "voice", "session", "route.ts"), "utf8");
const WRITTEN = readFileSync(join(__dirname, "..", "src", "lib", "ai", "prompt.ts"), "utf8");

describe("Italian is a tool, not the lesson", () => {
  it("tells the spoken coach to come back to English, in both engines", () => {
    // The shared instructions, used by the turn-based engine and by the model
    // delegated to behind the full-duplex one.
    expect(VOICE).toMatch(/LANGUAGE — the rule that outranks/);
    expect(VOICE).toMatch(/end(s)? in English/i);
    expect(VOICE).toMatch(/two turns in a row mostly in Italian/i);
    // And the voice layer of the new engine, which is what actually speaks.
    expect(VOICE).toMatch(/Italian is a tool for one sentence/i);
  });

  it("tells the written coach the same thing", () => {
    expect(WRITTEN).toMatch(/LANGUAGE, above all the rest/);
    expect(WRITTEN).toMatch(/end every reply in English/i);
    expect(WRITTEN).toMatch(/never "let us continue in Italian"/i);
  });

  it("says what being asked in Italian actually grants", () => {
    // The distinction the whole failure turned on: a request for help with one
    // thing, not a request to change language.
    expect(VOICE).toMatch(/never "let us switch to Italian"/i);
  });

  it("still allows Italian, because forbidding it would be worse", () => {
    // A beginner with no Italian at all is abandoned, not taught. The rule is
    // about returning, never about refusing.
    expect(VOICE).toMatch(/help them in Italian/i);
    expect(WRITTEN).toMatch(/Italian support/);
  });
});

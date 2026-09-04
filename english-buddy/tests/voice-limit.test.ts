import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COACH_MODES } from "@/lib/learning/modes";

const source = readFileSync("src/app/voice/VoiceClient.tsx", "utf8");

/** Reads a numeric constant out of the component, arithmetic included. */
function constant(name: string): number {
  const raw = source.match(new RegExp(`const ${name} = ([^;]+);`))?.[1];
  if (!raw) throw new Error(`${name} non è più definita in VoiceClient`);
  const cap = name === "MAX_SECONDS" ? raw : String(constant("MAX_SECONDS"));
  const [left, right] = raw.replace("MAX_SECONDS", cap).split("-");
  return right === undefined ? Number(left) : Number(left) - Number(right);
}

/**
 * The spoken session has a cap, and the cap is a promise made three times: to
 * the clock, to the sentence on screen before you start, and to the written
 * chat the conversation continues in. When those three drifted apart the
 * ending read as a crash — which is the whole reason this ends the way it
 * does now.
 */
describe("the fifteen-minute voice session", () => {
  it("stops at exactly the number of minutes the screen promises", () => {
    const cap = constant("MAX_SECONDS");
    expect(cap % 60).toBe(0);
    expect(source).toContain(`dura al massimo ${cap / 60} minuti`);
  });

  it("warns while there is still time to say goodbye", () => {
    const cap = constant("MAX_SECONDS");
    const warning = constant("WARNING_SECONDS");
    expect(warning).toBeGreaterThan(0);
    expect(warning).toBeLessThan(cap);
    // Long enough to close a thought, short enough not to spend the session
    // watching a countdown.
    expect(cap - warning).toBeGreaterThanOrEqual(30);
    expect(cap - warning).toBeLessThanOrEqual(120);
  });

  it("hands over to a written mode the coach API actually accepts", () => {
    // The exact bug that broke the first session for sales profiles: a mode
    // sent by the client that no schema on the server had heard of. "voice"
    // and "diary" are not written activities, and would fail the same way.
    const href = source.match(/const HANDOFF_HREF = "([^"]+)"/)?.[1];
    expect(href, "il pulsante di passaggio alla scrittura è sparito").toBeTruthy();
    const mode = new URL(href!, "https://www.execlingo.it").searchParams.get("mode");
    expect(COACH_MODES as readonly string[]).toContain(mode);
  });

  it("does not reuse the plain ending for the cap", () => {
    // "Ottima sessione!" after a cut-off sentence is what made people think
    // something had broken. The cap gets its own screen, and its own exit.
    expect(source).toContain("Facciamo una pausa");
    expect(source).toContain("reachedLimit");
    expect(source).toContain("HANDOFF_HREF");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VOICE_MODES } from "@/lib/learning/sessions";

const client = readFileSync("src/app/voice/VoiceClient.tsx", "utf8");
const chat = readFileSync("src/components/BuddyChat.tsx", "utf8");
const list = readFileSync("src/app/sessioni/page.tsx", "utf8");

/**
 * Three habits that are easy to delete by accident and expensive to lose,
 * because nothing visibly breaks when they go: the screen still works, the
 * call still connects, and the only symptom is a learner coming back to a
 * conversation that is no longer there.
 */
describe("a spoken conversation is saved while it is happening", () => {
  it("saves before the page can be frozen, which is what a locked phone does", () => {
    // The beacon is the whole point: a backgrounded page may never run code
    // again, and a normal request from it is not guaranteed to leave.
    expect(client).toMatch(/document\.hidden[\s\S]{0,400}flushBeacon\(\)/);
    expect(client).toContain('navigator.sendBeacon("/api/voice/turns"');
  });

  it("saves on a rhythm as well, so a slow conversation is not a lost one", () => {
    expect(client).toMatch(/flushTimerRef\.current = setInterval\(\(\) => \{ void flush\(\); \}, \d+\)/);
  });

  it("keeps lines pending until a request says they landed", () => {
    // Clearing them because a beacon was sent would lose exactly the lines
    // this exists to keep.
    expect(client).toMatch(/if \(response\.ok\) \{[\s\S]{0,260}pendingRef\.current = pendingRef\.current\.slice\(batch\.length\)/);
  });

  it("sends the last unsaved lines with the ending", () => {
    expect(client).toMatch(/sessionId: sessionRef\.current \|\| null/);
    expect(client).toMatch(/pending: left\.map/);
  });
});

describe("spoken and written stay on their own side", () => {
  it("the chat only ever offers back something that was written", () => {
    expect(chat).toContain('fetch("/api/sessioni?kind=text")');
  });

  it("the microphone only ever offers back something that was spoken", () => {
    expect(client).toContain('fetch("/api/sessioni?kind=voice")');
  });

  it("every spoken mode has a name on the list of sessions", () => {
    for (const mode of VOICE_MODES) expect(list, mode).toContain(`${mode}: "`);
  });

  it("the list can be narrowed to one or the other", () => {
    expect(list).toContain('kind: "voice"');
    expect(list).toContain('kind: "text"');
  });
});

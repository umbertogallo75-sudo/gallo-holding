import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chat = readFileSync("src/components/BuddyChat.tsx", "utf8");
const voice = readFileSync("src/app/voice/VoiceClient.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");

/**
 * Every tester interviewed missed the spoken conversation, and none of them
 * misread the screen: a microphone between a text box and a send button means
 * dictation in every other app they own. The fix is words, not a bigger icon —
 * and words that stop appearing once they are no longer news.
 */
describe("finding the spoken conversation", () => {
  it("says in words what the microphone cannot", () => {
    expect(chat).toContain("Preferisci parlare?");
    expect(chat).toContain("Non è dettatura");
    expect(chat).toContain("composerMicLabel");
  });

  it("stops inviting once the person has actually spoken", () => {
    // Written by the voice screen, read by the chat: one key, spelled the same
    // in both places, or the invitation never goes away.
    const key = "execlingo-voice-known";
    expect(chat).toContain(key);
    expect(voice).toContain(key);
    expect(chat).toContain("knowsVoice");
  });

  it("keeps the invitation above the box rather than in the row of buttons", () => {
    // It rides inside the composer as a full-width first item; without the
    // wrap it would squeeze the text box into nothing.
    expect(css).toContain(".composer { flex-wrap:wrap; }");
    expect(css).toContain(".voiceInvite { flex:1 0 100%; order:-1;");
  });

  it("offers something to say instead of a blank box", () => {
    expect(chat).toContain("STARTERS");
    expect(chat).toContain("Non sai come cominciare?");
    // Shown only before the person has written anything, and never mid-thought.
    expect(chat).toContain('const blank = !loading && !text');
  });
});

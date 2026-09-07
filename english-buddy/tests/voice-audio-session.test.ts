import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const voice = readFileSync("src/app/voice/VoiceClient.tsx", "utf8");
const swift = readFileSync("ios/ExecLingo/ExecLingo/ContentView.swift", "utf8");
const session = readFileSync("src/app/api/voice/session/route.ts", "utf8");

/**
 * On speakerphone the coach kept hearing itself and cutting off. The fix was
 * to have the native shell put the phone into a voice-chat audio session, so
 * the hardware echo canceller would run.
 *
 * It ran. It also took the audio session out from under the WebView that was
 * already recording through it: the call reached "live" and went straight to
 * "In pausa" at 0:00 — on headphones too, where there was no echo to cancel.
 *
 * A conversation that will not start is worse than one that echoes, so the
 * shell is not told about calls any more. These tests hold that line: it must
 * not come back without somebody testing it on a real phone first.
 */
describe("the phone's audio session belongs to WebKit", () => {
  it("does not reach for the native audio bridge from the page", () => {
    expect(voice).not.toContain("messageHandlers?.audio");
    expect(voice).not.toContain("tellPhoneAboutCall");
  });

  it("leaves no handler in the shell for it to reach", () => {
    expect(swift).not.toContain('name: "audio"');
    expect(swift).not.toContain("setVoiceCallAudio");
    expect(swift).not.toContain("AVAudioSession");
  });

  it("keeps the one part of the echo fix that never broke anything", () => {
    // The model's own noise handling is server-side and touches no session:
    // a microphone across a room, not held against a mouth.
    expect(session).toContain('noise_reduction: { type: "far_field" }');
    expect(session).not.toContain("near_field");
  });

  it("still stops the clock when something really does take the call away", () => {
    // The pause exists for phone calls and lock screens, and that behaviour is
    // unchanged — it was being triggered by our own doing, not by a caller.
    expect(voice).toContain('setInterrupted("paused")');
    expect(voice).toContain("visibilitychange");
  });
});

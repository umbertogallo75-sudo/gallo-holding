import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const voice = readFileSync("src/app/voice/VoiceClient.tsx", "utf8");
const swift = readFileSync("ios/ExecLingo/ExecLingo/ContentView.swift", "utf8");
const session = readFileSync("src/app/api/voice/session/route.ts", "utf8");

/**
 * On speakerphone the coach kept hearing speech in a silent room and cutting
 * itself off; with headphones it never did. That difference is the whole
 * diagnosis: there is an acoustic path from the loudspeaker back to the
 * microphone, and nothing was cancelling it.
 */
describe("l'eco a vivavoce", () => {
  it("expects a microphone across the room, not against a mouth", () => {
    expect(session).toContain('noise_reduction: { type: "far_field" }');
    expect(session).not.toContain("near_field");
  });

  it("puts the phone into call mode for the length of the call", () => {
    // .voiceChat is what turns on the echo canceller in the phone itself;
    // asking the browser for echoCancellation does not reach it.
    expect(swift).toContain("AVFoundation");
    expect(swift).toContain(".playAndRecord, mode: .voiceChat");
    // Play-and-record comes out of the earpiece otherwise, which reads as a
    // broken volume control.
    expect(swift).toContain(".defaultToSpeaker");
    expect(swift).toContain('name: "audio"');
  });

  it("hands it back afterwards, however the call ended", () => {
    // Through cleanup, which every exit goes through: stopped, cap reached,
    // connection lost, page closed.
    expect(voice).toContain("function cleanup(report: boolean) {\n    tellPhoneAboutCall(false);");
    expect(voice).toContain("tellPhoneAboutCall(true)");
    expect(swift).toContain("setActive(false, options: [.notifyOthersOnDeactivation])");
  });

  it("does nothing at all outside the app, or in an older build of it", () => {
    expect(voice).toContain("webkit?.messageHandlers?.audio");
    expect(voice).toContain("bridge?.postMessage");
  });
});

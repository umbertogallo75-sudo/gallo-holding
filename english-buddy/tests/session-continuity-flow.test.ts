import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isSyntheticOpener, openerFor, RESUME_PROMPT } from "@/lib/learning/openers";

const chat = readFileSync("src/components/BuddyChat.tsx", "utf8");
const coach = readFileSync("src/app/api/coach/route.ts", "utf8");
const prompt = readFileSync("src/lib/ai/prompt.ts", "utf8");
const voiceRoute = readFileSync("src/app/api/voice/session/route.ts", "utf8");
const voice = readFileSync("src/app/voice/VoiceClient.tsx", "utf8");

describe("the lines nobody said", () => {
  it("recognises every opener, so none of them is ever shown as a message", () => {
    for (const mode of ["text-5", "guided", "levelcheck", "zero"]) {
      expect(isSyntheticOpener(openerFor(mode)), mode).toBe(true);
    }
    expect(isSyntheticOpener(RESUME_PROMPT)).toBe(true);
    expect(isSyntheticOpener("I will send the offer tomorrow")).toBe(false);
  });

  it("is not stored as something the learner wrote", () => {
    expect(coach).toContain("const synthetic = parsed.data.opening && isSyntheticOpener(message)");
    expect(coach).toContain("if (!synthetic) await saveMessage(userId, sessionId, \"user\", message)");
  });
});

describe("resuming a written conversation", () => {
  it("asks whether there is one before opening a new one", () => {
    // The offer used to arrive after Sam had already greeted them into a
    // brand-new session, which is why accepting it changed nothing.
    const mount = chat.slice(chat.indexOf("if (started.current) return;"));
    const ask = mount.indexOf('fetch("/api/sessioni?kind=text")');
    const open = mount.indexOf("void send(openerFor(mode), false, true)");
    expect(ask).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(ask);
  });

  it("has Sam say something when the thread is picked up", () => {
    expect(chat).toContain("void send(RESUME_PROMPT, false)");
  });

  it("still starts a conversation for somebody who chose to begin again", () => {
    expect(chat).toMatch(/setResumable\(null\); void send\(openerFor\(mode\), false, true\)/);
  });
});

describe("a session is the next step, not another first one", () => {
  it("the written coach is told what happened last time", () => {
    expect(prompt).toContain("continuityBlock(memory.continuity ?? null)");
  });

  it("so is the spoken one", () => {
    expect(voiceRoute).toContain("readContinuity(userId, null)");
    expect(voiceRoute).toContain("instructions += continuityBlock(continuity)");
  });

  it("and picking up this very call outranks the older history", () => {
    const withContinuity = voiceRoute.indexOf("instructions += continuityBlock(continuity)");
    const withPickUp = voiceRoute.indexOf("instructions += pickUpBlock(resumed.recap)");
    expect(withContinuity).toBeGreaterThan(-1);
    expect(withPickUp).toBeGreaterThan(withContinuity);
  });
});

describe("who can be heard during a spoken lesson", () => {
  it("can be paused without ending the call", () => {
    expect(voice).toContain("function pauseCall()");
    expect(voice).toContain("function resumeCall()");
    // The connection stays open, so coming back is immediate rather than a
    // second permission prompt and a reconnection.
    expect(voice).not.toMatch(/function pauseCall\(\)[\s\S]{0,400}pcRef\.current\?\.close/);
  });

  it("stops the clock and Sam's voice while paused", () => {
    const body = voice.slice(voice.indexOf("function pauseCall()"), voice.indexOf("/** And back."));
    expect(body).toContain("pauseClock()");
    expect(body).toContain("audioRef.current?.pause()");
    expect(body).toContain("applyMic()");
  });

  it("keeps the microphone shut in push-to-talk until the button is held", () => {
    expect(voice).toContain("const open = !pausedRef.current && (!pttRef.current || talkingRef.current)");
    // Disabled, not stopped: a stopped track needs the permission prompt again.
    expect(voice).toContain("track.enabled = open");
    expect(voice).not.toMatch(/function applyMic\(\)[\s\S]{0,300}getAudioTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/);
  });

  it("closes the microphone again if the finger slides off the button", () => {
    expect(voice).toContain("onPointerCancel={holdEnd}");
    expect(voice).toContain("onLostPointerCapture={holdEnd}");
  });

  it("does not restart the clock behind a pause", () => {
    expect(voice).toContain("if (!pausedRef.current) startClock()");
  });
});

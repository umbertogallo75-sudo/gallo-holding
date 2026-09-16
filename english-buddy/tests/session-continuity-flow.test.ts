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
  it("can be closed and reopened without ending the call", () => {
    expect(voice).toContain("function pauseCall()");
    expect(voice).toContain("function resumeCall()");
    // The connection stays open, so coming back is immediate rather than a
    // second permission prompt and a reconnection.
    expect(voice).not.toMatch(/function pauseCall\(\)[\s\S]{0,400}pcRef\.current\?\.close/);
  });

  it("stops the clock and Sam's voice while the microphone is shut", () => {
    const body = voice.slice(voice.indexOf("function pauseCall()"), voice.indexOf("/** And back."));
    expect(body).toContain("pauseClock()");
    expect(body).toContain("audioRef.current?.pause()");
    expect(body).toContain("applyMic()");
  });

  it("closes the microphone without stopping the track", () => {
    // A stopped track cannot be restarted without asking for the microphone
    // again, which on iOS means a permission prompt mid-lesson.
    expect(voice).toContain("const open = !pausedRef.current");
    expect(voice).toContain("track.enabled = open");
    expect(voice).not.toMatch(/function applyMic\(\)[\s\S]{0,300}\.stop\(\)/);
  });

  it("is one switch you tap, not a button you hold", () => {
    // Hold-to-talk was the first attempt and the thumb covered the transcript,
    // which is where you read what Sam just said.
    expect(voice).toContain('{paused ? "🎙️ Avvia per parlare" : "⏸ Pausa"}');
    expect(voice).toContain("onClick={paused ? resumeCall : pauseCall}");
    expect(voice).not.toContain("onPointerDown");
    expect(voice).not.toContain("Tieni premuto");
  });

  it("does not restart the clock behind a pause", () => {
    expect(voice).toContain("if (!pausedRef.current) startClock()");
  });
});

describe("the call card holds what is put in it", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  it("is a column, not a grid of exactly three columns", () => {
    // It was `grid-template-columns: auto 1fr auto`, which works until a
    // fourth child arrives — then the controls are dealt into those columns
    // and slide off the side of the phone.
    const rule = css.slice(css.indexOf(".voiceLive {"), css.indexOf(".voiceHead {"));
    expect(rule).toContain("flex-direction:column");
    expect(rule).not.toContain("grid-template-columns");
  });

  it("gives the head and the controls their own rows", () => {
    expect(css).toContain(".voiceHead { display:flex;");
    expect(css).toContain(".voiceControls { display:flex;");
  });
});

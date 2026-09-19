import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coachInstructions } from "@/lib/ai/prompt";
import type { LearningContext } from "@/lib/learning/service";

const memory: LearningContext = {
  profile: { displayName: "Umberto", nativeLanguage: "Italian", professionalContext: "CEO", startingLevel: "independent", translationSupport: true },
  monthPhase: 1,
  capabilitiesAchieved: [],
  mistakes7d: 0,
  masteredExpressions: 0,
  weeklyFocus: null,
  recentMistakes: [],
  dueMistakes: [],
  dueExpressions: [],
  recentMessages: [],
  continuity: null,
  todayMinutes: 0,
  todayInteractions: 0,
};

const voiceRoute = readFileSync("src/app/api/voice/session/route.ts", "utf8");

/**
 * The rules that came out of a tester's own session, quoted in the report:
 * "Your Cavaliers answer sounded natural — now let's bring that confidence
 * into a meeting". He had chosen basketball at nine in the evening; the coach
 * used it as a bridge back to work, and he wrote that if you force him back
 * there you lose him.
 */
describe("whose subject a conversation is", () => {
  const prompt = coachInstructions(memory, "text-5");

  it("tells the coach the subject belongs to the learner", () => {
    expect(prompt).toContain("The subject belongs to them");
    expect(prompt).toContain("NEVER steer a conversation back to work");
  });

  it("forbids the redirect in the very turn a conversation is picked back up", () => {
    expect(prompt).toContain("never redirect in the same turn as picking a conversation back up");
  });

  it("says it to the spoken coach too", () => {
    expect(voiceRoute).toContain("The subject belongs to them");
    expect(voiceRoute).toContain("hangs up");
  });
});

describe("opening a conversation", () => {
  it("offers a choice instead of an empty turn", () => {
    // "Clicco sul pulsante verde e lui mi dice 'tocca a te'. Ma cosa devo
    // dire? Non c'è guida. L'utente si disagia e abbandona."
    const prompt = coachInstructions(memory, "text-5");
    expect(prompt).toContain("ends with a CHOICE");
    expect(prompt).toMatch(/work, travel, or something lighter/);
    expect(voiceRoute).toContain("CHOICE of two or three directions");
  });
});

describe("the entry test", () => {
  const prompt = coachInstructions(memory, "levelcheck");

  it("does not correct while it is measuring", () => {
    // Every correction changes what they say next, which is the thing being
    // measured.
    expect(prompt).toContain("do NOT correct anything while the test is running");
  });

  it("asks about ten questions, climbing", () => {
    expect(prompt).toContain("about TEN questions");
    expect(prompt).toContain("find the ceiling");
  });

  it("ends with a verdict that is articulated, not a label", () => {
    for (const piece of ["what they can already do", "what is holding them back most", "honest starting level"]) {
      expect(prompt, piece).toContain(piece);
    }
    expect(prompt).toContain("neither flattering nor discouraging");
  });

  it("never reopens an old conversation, because it measures today", () => {
    const chat = readFileSync("src/components/BuddyChat.tsx", "utf8");
    expect(chat).toContain('mode !== "levelcheck"');
  });
});

describe("the guided session", () => {
  const prompt = coachInstructions(memory, "guided");

  it("leads instead of asking what they feel like", () => {
    // "Sessione Guidata è una ridondanza e promette qualcosa che non
    // mantiene": it behaved like an ordinary chat.
    expect(prompt).toContain("you lead, they follow");
    expect(prompt).toContain("SAYING THE PLAN");
    expect(prompt).toContain('Never hand the wheel back with "what would you like to talk about?"');
  });
});

describe("the spoken conversation on screen", () => {
  const voice = readFileSync("src/app/voice/VoiceClient.tsx", "utf8");

  it("shows the words as they are said, not when the sentence is over", () => {
    // "Capita che ci sia un delay tra la richiesta parlata di Sam e la
    // comparsa del blocco di testo": the deltas were arriving all along and
    // were being thrown away on this engine.
    expect(voice).toContain('event.type === "response.output_audio_transcript.delta"');
    expect(voice).toContain('event.type === "conversation.item.input_audio_transcription.delta"');
    expect(voice).toContain("voiceLineLive");
  });

  it("carries the conversation into the microphone instead of starting another", () => {
    const chat = readFileSync("src/components/BuddyChat.tsx", "utf8");
    expect(chat).toContain("`/voice?riprendi=${encodeURIComponent(sessionId)}`");
    expect(voice).toContain("Stai continuando la conversazione di adesso");
  });

  it("carries a question that arrived by notification, which has no session yet", () => {
    // "Quando arriva la notifica e poi vai in Voice perdi la memoria sulla
    // domanda che ti aveva posto e lui si mette in attesa. Rimani bloccato."
    const chat = readFileSync("src/components/BuddyChat.tsx", "utf8");
    expect(chat).toContain("`/voice?domanda=${encodeURIComponent(initialQuestion.slice(0, 300))}`");
    expect(voiceRoute).toContain("THE QUESTION THEY CAME TO ANSWER");
    expect(voiceRoute).toContain("Open the call by asking it again out loud");
  });

  it("quotes the last thing Sam said, not the first", () => {
    expect(voice).toContain('const lastCoach = [...lines].reverse().find((line) => line.role === "assistant")');
  });

  it("says the sentence the way it was asked for", () => {
    expect(voice).toContain("Sam sta ascoltando: puoi mettere in pausa la conversazione o terminarla quando preferisci.");
  });

  it("does not let an empty call card fill the screen", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain(".voiceStage > .voiceTranscript { flex: 1;");
    expect(css).not.toContain(".voiceStage > .card:last-child { flex: 1;");
  });
});

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

  it("climbs a ladder of ten, and leaves the counting to the code", () => {
    // The ladder stays in the prompt; the count does not. Asked to keep its
    // own tally the coach lost it, and testers got a test that never ended.
    expect(prompt).toContain("find the ceiling");
    expect(prompt).toContain("do not count and do not decide the ending yourself");
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

describe("niente aiuti mentre si misura", () => {
  it("toglie «non so cosa dire» e i tre argomenti dalla prova di livello", () => {
    // Uno strumento che ti mette in bocca una frase inglese, dentro l'esercizio
    // che serve a misurare quali frasi sai produrre. È la stessa ragione per
    // cui Sam non corregge durante la prova.
    const chat = readFileSync("src/components/BuddyChat.tsx", "utf8");
    expect(chat).toContain("const canAskHelp = !measuring");
    expect(chat).toContain("const blank = !measuring");
  });
});

describe("la pronuncia ha una soglia, non solo una correzione", () => {
  const drill = coachInstructions(memory, "shadow");

  it("dice che cosa basta: farsi capire, non sembrare madrelingua", () => {
    // "Quando la pronuncia non è perfettamente corretta non puoi dire sempre
    // che non è corretta e me la fai ripetere di continuo." Le istruzioni
    // descrivevano solo cosa correggere: senza una soglia, nessuna pronuncia
    // di un adulto italiano la supera mai e l'esercizio non ha un'uscita.
    expect(drill).toContain("The standard is being UNDERSTOOD");
    expect(drill).toContain("An Italian accent is not a mistake");
    expect(drill).toContain("assume they said it well");
  });

  it("vieta di tenere qualcuno sulla stessa frase", () => {
    expect(drill).toContain("Never present the same sentence twice in a row");
    expect(drill).toContain("never hold them on one until it is right");
  });

  it("dice le stesse due cose anche al microfono", () => {
    // Le due versioni del drill devono muoversi insieme: la soglia è un testo
    // solo, importato da entrambe.
    expect(voiceRoute).toContain("PRONUNCIATION_STANDARD");
    expect(voiceRoute).toContain("Never give the same sentence twice in a row");
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
    // The microphone opens over the chat now rather than on its own page, and
    // it is handed the session being written in: same thread, other medium.
    expect(chat).toContain("reopen={sessionId}");
    expect(voice).toContain("Stai continuando la conversazione di adesso");
  });

  it("opens the microphone without asking for a second tap", () => {
    // Reported twice: "premo il microfono e mi porta alla sezione Voice in cui
    // devo premere il pulsante Inizia a parlare". Removing the change of page
    // was not enough — the same card with the same green button came up
    // inside the layer, so from a thumb's point of view nothing had changed.
    const chat = readFileSync("src/components/BuddyChat.tsx", "utf8");
    expect(chat).toContain("autoStart");
    expect(voice).toContain("if (!autoStart || lookedRef.current) return;");
    expect(voice).toContain("void start(lastEngine(), reopen);");
    // And the headphones warning has to survive skipping the screen it was on.
    expect(voice).toContain("Alza il volume o metti le cuffie");
  });

  it("brings the spoken lines back into the chat when the call closes", () => {
    const chat = readFileSync("src/components/BuddyChat.tsx", "utf8");
    // Reads the transcript back and says nothing of its own: the person has
    // just been talking to Sam, and a fresh greeting would undo the point of
    // keeping it one conversation.
    expect(chat).toContain("function closeCall()");
    expect(chat).toContain("onSession={(id) => { callSession.current = id; }}");
    // Twice: the spoken lines leave in batches eight seconds apart and the
    // last one leaves on the way out, so a transcript read immediately is
    // missing the end of the conversation.
    expect(chat).toContain("if (sends.current === mark) void load(id);");
  });

  it("carries a question that arrived by notification, which has no session yet", () => {
    // "Quando arriva la notifica e poi vai in Voice perdi la memoria sulla
    // domanda che ti aveva posto e lui si mette in attesa. Rimani bloccato."
    const chat = readFileSync("src/components/BuddyChat.tsx", "utf8");
    expect(chat).toContain("question={!sessionId ? initialQuestion?.slice(0, 300) : undefined}");
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

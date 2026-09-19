import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GAMES, LIVE_GAMES } from "@/lib/games/catalog";
import { coachInstructions } from "@/lib/ai/prompt";
import type { LearningContext } from "@/lib/learning/service";

const grid = readFileSync("src/components/ModeGrid.tsx", "utf8");
const voicePage = readFileSync("src/app/voice/page.tsx", "utf8");
const voiceRoute = readFileSync("src/app/api/voice/session/route.ts", "utf8");
const phrasebook = readFileSync("src/app/phrasebook/page.tsx", "utf8");
const meeting = readFileSync("src/app/riunione/MeetingClient.tsx", "utf8");

const memory: LearningContext = {
  profile: null,
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

/**
 * "Separerei le conversazioni che terrei aperte dagli allenamenti in cui
 * metterei un set di domande a cui rispondere." Sixteen doors in one list,
 * with no way to tell which was which.
 */
describe("the catalogue", () => {
  it("separates conversations from exercises", () => {
    const conversations = grid.indexOf("Conversazioni · parli tu");
    const exercises = grid.indexOf("Esercizi · una serie di domande, con una fine");
    expect(conversations).toBeGreaterThan(-1);
    expect(exercises).toBeGreaterThan(conversations);
  });

  it("no longer offers the two activities testers could not make sense of", () => {
    // "Missione: è un'altra cosa che toglierei e che faccio fatica a capire."
    // "Diario parlato: per me è del tutto inutile."
    expect(grid).not.toContain("mode=mission");
    expect(grid).not.toContain("mode=diary");
  });

  it("sends the repeat-after-me exercise to the microphone, where it can be heard", () => {
    // "Ti manda a Voice e si perde."
    expect(grid).toContain("/voice?mode=shadow");
    expect(voicePage).toContain('params.mode === "shadow"');
    expect(voiceRoute).toContain("PRONUNCIATION DRILL");
    expect(voiceRoute).toContain("Do NOT correct grammar");
  });
});

describe("the gym", () => {
  it("drops the exercise that was the same as another one", () => {
    // "FlashIT: inutile. È uguale ad Ascolta e Scegli."
    expect(GAMES.some((game) => game.slug === "flash")).toBe(false);
  });

  it("has the dictation as a game of its own", () => {
    const dictation = LIVE_GAMES.find((game) => game.slug === "dettato");
    expect(dictation).toBeTruthy();
    expect(dictation?.title).toBe("Ascolta e scrivi");
  });

  it("keeps no microphone on a written dictation", () => {
    // "Toglierei la parte del microfono perché se no il nome perde di
    // significato."
    const page = readFileSync("src/app/palestra/dettato/Dictation.tsx", "utf8");
    expect(page).not.toContain("/voice");
    expect(page).not.toContain("getUserMedia");
  });
});

describe("the exercises that were rewritten rather than removed", () => {
  it("gives the review its context before the gap", () => {
    // "Io spiegherei prima il contesto. Tipo 'vuoi dire che siete
    // specializzati in questo e quello', poi la frase in inglese."
    const prompt = coachInstructions(memory, "review");
    expect(prompt).toContain("FIRST say, in Italian, the situation");
    expect(prompt).toContain("Vuoi dire al cliente");
  });

  it("makes the daily read ask for something back", () => {
    // "Proponi una lettura ma non farmi domande per farmi parlare. Chiedimi di
    // scrivere in italiano cosa ho capito."
    const prompt = coachInstructions(memory, "briefing");
    expect(prompt).toContain("IN ITALIAN what they understood");
    expect(prompt).toContain("Reading without having to produce anything teaches nothing");
  });
});

describe("the phrasebook belongs to the learner", () => {
  it("shows their own choices apart from Sam's", () => {
    // "Creerei un sistema di bookmark in cui l'utente e solo l'utente decide
    // cosa mettere qui."
    expect(phrasebook).toContain("Le tue ({mine.length})");
    expect(phrasebook).toContain("Proposte da Sam ({fromSam.length})");
    expect(phrasebook).toContain("saved_by_user");
  });

  it("still opens on a database that has never heard of the flag", () => {
    expect(phrasebook).toContain(".catch(() =>");
  });
});

describe("one way to ask how something is said", () => {
  it("gives the same three versions in the meeting as in the rescue", () => {
    // "Non capisco la differenza tra il 'come si dice' in Sono in riunione e
    // Mi serve adesso. Mi sembra una ripetizione." It was the same feature
    // with two of the three answers and no audio.
    expect(meeting).toContain('key: "simple"');
    expect(meeting).toContain('key: "natural"');
    expect(meeting).toContain('key: "business"');
    expect(meeting).toContain("<Speak text={version.text} compact />");
  });
});

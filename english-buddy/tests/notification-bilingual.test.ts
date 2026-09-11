import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bannerForNotification, bilingualBody, poolQuestion, splitQuestion } from "@/lib/push/content";

/**
 * The app teaches English to people who do not have it yet, and the daily
 * question went out in English only — so the one message that reaches a
 * learner all day was unreadable on their lock screen, for exactly the people
 * it exists for.
 */
describe("every notification carries both languages", () => {
  it("gives the fallback pool an Italian line for every question", () => {
    // The pool is what goes out when the model call fails. It used to be
    // English only, so a failure meant an unreadable notification.
    const seen = new Set<string>();
    for (let i = 0; i < 400; i += 1) {
      const question = poolQuestion(`seed-${i}`);
      expect(question.en.trim(), `voce senza inglese`).not.toBe("");
      expect(question.it.trim(), `"${question.en}" non ha l'italiano`).not.toBe("");
      // The two must actually differ, or somebody pasted the English twice.
      expect(question.it).not.toBe(question.en);
      seen.add(question.en);
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it("puts the English first, because the English is the lesson", () => {
    const body = bilingualBody({ en: "What did you have for lunch?", it: "Cosa hai mangiato a pranzo?" });
    expect(body.indexOf("What")).toBeLessThan(body.indexOf("Cosa"));
    expect(body).toContain("\n");
  });

  it("sends one line rather than a stray newline when there is no translation", () => {
    expect(bilingualBody({ en: "Only this", it: "" })).toBe("Only this");
  });
});

describe("reading the model's two lines", () => {
  it("takes the plain case", () => {
    expect(splitQuestion("How was your meeting?\nCom'è andata la riunione?")).toEqual({
      en: "How was your meeting?",
      it: "Com'è andata la riunione?",
    });
  });

  it("survives the shapes a model reaches for on its own", () => {
    expect(splitQuestion('"How was your day?"\n"Come stai oggi?"')?.en).toBe("How was your day?");
    expect(splitQuestion("- How was your day?\n- Com'è andata?")?.it).toBe("Com'è andata?");
    expect(splitQuestion("English: How was your day?\nItaliano: Com'è andata?")?.en).toBe("How was your day?");
    expect(splitQuestion("How was your day?\n\nCom'è andata?")?.it).toBe("Com'è andata?");
  });

  it("refuses anything that is not two real lines", () => {
    // Refusing sends the bilingual pool instead, which is always readable.
    expect(splitQuestion("Just one line, in English only")).toBeNull();
    expect(splitQuestion("")).toBeNull();
    expect(splitQuestion("ok\nsì")).toBeNull();
  });
});

describe("the scheduler", () => {
  const cron = readFileSync(join(__dirname, "..", "src", "app", "api", "cron", "notifications", "route.ts"), "utf8");

  it("shows both languages but opens the chat with the English one", () => {
    // The Italian belongs on the lock screen, not in the conversation: Sam is
    // asking an English question, and it is the question he must receive.
    expect(cron).toContain("bilingualBody(question)");
    expect(cron).toContain("encodeURIComponent(question.en)");
  });

  it("keeps the English in the history, so repeats are still detected", () => {
    expect(cron).toContain("question.en, now.toISOString()");
  });

  it("picks the picture from the English, where the topic words are", () => {
    expect(cron).toContain("question: question.en");
    expect(bannerForNotification({ question: "Where is the airport?", seed: "s" })).toContain("banner-26");
  });
});

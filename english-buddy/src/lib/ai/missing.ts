import { z } from "zod";
import { runStructured } from "./openai";

/**
 * "La frase che mi è mancata": the user says in Italian what they could not
 * say in English, and gets it back — the phrase they would actually use in a
 * meeting, plus a warmer and a blunter alternative, and the register note that
 * tells them which one to pick. The phrase then enters the spaced repetition
 * they already have, so a real gap becomes tomorrow's practice.
 */

export const missingPhraseSchema = z.object({
  /** The phrase to use, in English. */
  english: z.string().min(1).max(300),
  /** What it says, back in Italian, so nothing is taken on trust. */
  italian: z.string().min(1).max(300),
  /** When to use it and how it lands — one short line, in Italian. */
  note: z.string().max(300),
  /** Two ways to say the same thing: softer, and more direct. */
  alternatives: z.array(z.object({ english: z.string().min(1).max(300), tone: z.string().min(1).max(60) })).max(2),
});

export type MissingPhrase = z.infer<typeof missingPhraseSchema>;

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["english", "italian", "note", "alternatives"],
  properties: {
    english: { type: "string" },
    italian: { type: "string" },
    note: { type: "string" },
    alternatives: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["english", "tone"],
        properties: { english: { type: "string" }, tone: { type: "string" } },
      },
    },
  },
};

const INSTRUCTIONS = `You help an Italian professional say, in English, the thing they could not say.

They write in Italian what they wanted to express, sometimes hastily, sometimes mid-meeting. Give them the sentence they would actually use at work — natural, current business English, the register of a competent colleague. Never textbook English, never slang, never over-polite formulas nobody says.

Rules:
- "english": one sentence they can use as-is. If the input is a single word, give the phrase they would need around it.
- "italian": what that English sentence says, in Italian. Not a word-for-word gloss — what it conveys.
- "note": one short line in Italian on when it fits and how it lands. Skip the obvious.
- "alternatives": at most two, one softer and one more direct, each with a one-word tone in Italian (e.g. "più morbido", "più diretto").

If the input is already in English, correct it into what a native would say and explain the difference. If it is too vague to be a sentence, choose the most likely meaning in a work context and go with it.`;

export async function findMissingPhrase(italian: string, context: string | null): Promise<MissingPhrase> {
  const input = context
    ? `Contesto professionale: ${context}\n\nVoleva dire: ${italian}`
    : `Voleva dire: ${italian}`;
  const raw = await runStructured(INSTRUCTIONS, input, "missing_phrase", jsonSchema, 700);
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return missingPhraseSchema.parse(JSON.parse(cleaned));
}

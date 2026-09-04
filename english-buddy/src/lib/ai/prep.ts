import { z } from "zod";
import { runStructured } from "./openai";

/**
 * Preparation for one real appointment. The user writes a line — "giovedì call
 * col fornitore tedesco sul ritardo delle consegne" — and gets what they will
 * actually need in that room: the sentences to open with, the questions they
 * will be asked, and the one thing to keep in mind.
 *
 * This is the difference between a course and a coach: a course teaches the
 * unit on complaints, a coach prepares you for Thursday.
 */

export const prepSchema = z.object({
  /** One line, in Italian: how to play it. */
  strategy: z.string().min(1).max(400),
  /** The sentences to have ready, in the order they would come up. */
  phrases: z.array(z.object({
    english: z.string().min(1).max(220),
    italian: z.string().min(1).max(220),
    /** What it is for: "aprire", "chiedere tempo", "dire di no"… */
    use: z.string().min(1).max(60),
  })).min(4).max(12),
  /** What they are likely to be asked, and how to start answering. */
  questions: z.array(z.object({
    english: z.string().min(1).max(220),
    italian: z.string().min(1).max(220),
    answerStart: z.string().min(1).max(220),
  })).min(2).max(5),
});

export type EventPrep = z.infer<typeof prepSchema>;

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["strategy", "phrases", "questions"],
  properties: {
    strategy: { type: "string" },
    phrases: {
      type: "array",
      minItems: 4,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["english", "italian", "use"],
        properties: { english: { type: "string" }, italian: { type: "string" }, use: { type: "string" } },
      },
    },
    questions: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["english", "italian", "answerStart"],
        properties: { english: { type: "string" }, italian: { type: "string" }, answerStart: { type: "string" } },
      },
    },
  },
};

const INSTRUCTIONS = `You prepare an Italian professional for one specific appointment in English — a meeting, a call, a negotiation, a trip.

They describe it in a line, in Italian. Give them what they will actually need in that room, not a lesson on the topic.

- "strategy": one line in Italian on how to play it — the thing that changes the outcome, not generic advice. Skip pleasantries.
- "phrases": 6 to 10 sentences in the order they would come up: opening, the core of what they must get across, holding their ground, closing. Current business English, the register of a competent colleague — never textbook, never slang, never over-polite formulas nobody says. "use" is one or two words in Italian saying what the sentence is for.
- "questions": 3 likely questions they will be asked, in English, with the Italian and a natural opening for the answer they can build on.

Write for someone who is competent in their job and uncertain in the language: never explain their business to them, only the English. If the description is vague, choose the most probable work situation and prepare for that.`;

export async function prepareForEvent(
  title: string,
  context: string | null,
  level: string | null,
  /** What the person going into the room knows that the calendar does not. */
  notes?: string | null,
  /** What was made of the documents attached to this appointment. */
  documents?: string | null
): Promise<EventPrep> {
  const lines = [`Appuntamento: ${title}`];
  if (context) lines.push(`Contesto professionale: ${context}`);
  if (level) lines.push(`Livello di inglese: ${level}`);
  // Last, and marked as the most important: a title is a label, these are the
  // facts, and a sheet prepared from the label alone is a generic sheet.
  if (notes?.trim()) lines.push(`\nQUELLO CHE L'UTENTE SA DI QUESTO INCONTRO, e che conta più del titolo:\n${notes.trim()}`);
  if (documents?.trim()) lines.push(`\nDOCUMENTI DI QUESTO INCONTRO:\n${documents.trim()}`);
  const raw = await runStructured(INSTRUCTIONS, lines.join("\n"), "event_prep", jsonSchema, 2200);
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return prepSchema.parse(JSON.parse(cleaned));
}

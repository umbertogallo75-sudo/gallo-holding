import { z } from "zod";
import { runStructured } from "./openai";

/**
 * The two minutes after the meeting. The user says how it went and what they
 * could not say; Sam turns that into the phrases they will need next time.
 *
 * This is where the loop closes: the syllabus stops being ours and becomes
 * theirs — what actually failed this morning is what comes back next week.
 */

export const debriefSchema = z.object({
  /** Two lines in Italian: what went well, and the one thing to work on. */
  feedback: z.string().min(1).max(500),
  /** The phrases that were missing, ready for next time. */
  phrases: z.array(z.object({
    english: z.string().min(1).max(220),
    italian: z.string().min(1).max(220),
  })).min(1).max(6),
});

export type EventDebrief = z.infer<typeof debriefSchema>;

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["feedback", "phrases"],
  properties: {
    feedback: { type: "string" },
    phrases: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["english", "italian"],
        properties: { english: { type: "string" }, italian: { type: "string" } },
      },
    },
  },
};

const INSTRUCTIONS = `An Italian professional has just come out of a meeting, call or trip held in English. They tell you in Italian how it went and what they could not say.

- "feedback": two short lines in Italian. First what they handled well — specific, from what they wrote, never flattery. Then the one thing worth working on before the next one. Talk to a competent adult who was in a hard situation, not to a student.
- "phrases": the sentences they were missing, in the English they would actually use at work — 2 to 5 of them, each with the Italian. If they did not name a specific gap, take the situation they describe and give the phrases that situation demands.

Never comment on their business decisions. Only the English.`;

export async function debriefEvent(title: string, howItWent: string, missing: string | null): Promise<EventDebrief> {
  const lines = [`Appuntamento: ${title}`, `Com'è andata: ${howItWent}`];
  if (missing) lines.push(`Cosa non è riuscito a dire: ${missing}`);
  const raw = await runStructured(INSTRUCTIONS, lines.join("\n"), "event_debrief", jsonSchema, 1200);
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return debriefSchema.parse(JSON.parse(cleaned));
}

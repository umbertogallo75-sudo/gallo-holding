import { z } from "zod";

export const mistakeCategories = ["grammar", "vocabulary", "word_order", "tense", "preposition", "article", "business_expression", "register", "other"] as const;
export const skillNames = ["listening", "speaking", "business_conversation", "vocabulary", "grammar", "pronunciation", "fluency", "comprehension"] as const;
export type SkillName = (typeof skillNames)[number];

export const coachResultSchema = z.object({
  reply: z.string(),
  correction: z.string().default(""),
  mistakes: z.array(
    z.object({
      incorrect: z.string(),
      correct: z.string(),
      category: z.enum(mistakeCategories).catch("other"),
      severity: z.enum(["minor", "meaningful", "important"]).catch("minor"),
      note: z.string().default(""),
    })
  ).default([]),
  expressions: z.array(
    z.object({ expression: z.string(), meaning: z.string().default("") })
  ).default([]),
  // Items from the user's due-review list the model reused this turn.
  reviewed_items: z.array(
    z.object({ text: z.string(), success: z.boolean() })
  ).default([]),
  skill_updates: z.record(z.string(), z.number()).default({}),
});

export type CoachResult = z.infer<typeof coachResultSchema>;
export type CoachMistake = CoachResult["mistakes"][number];

/** JSON Schema for OpenAI structured outputs (strict mode). */
export const coachResultJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "correction", "mistakes", "expressions", "reviewed_items", "skill_updates"],
  properties: {
    reply: { type: "string", description: "Natural next reply/question in English." },
    correction: { type: "string", description: "One short user-facing correction of the user's last message, or empty string." },
    mistakes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["incorrect", "correct", "category", "severity", "note"],
        properties: {
          incorrect: { type: "string" },
          correct: { type: "string" },
          category: { type: "string", enum: [...mistakeCategories] },
          severity: { type: "string", enum: ["minor", "meaningful", "important"] },
          note: { type: "string", description: "Short user-facing explanation, or empty string." },
        },
      },
    },
    expressions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["expression", "meaning"],
        properties: {
          expression: { type: "string" },
          meaning: { type: "string" },
        },
      },
    },
    reviewed_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "success"],
        properties: {
          text: { type: "string", description: "The due expression or mistake text that was practiced this turn." },
          success: { type: "boolean", description: "True if the user produced or understood it correctly." },
        },
      },
    },
    skill_updates: {
      type: "object",
      additionalProperties: false,
      required: [...skillNames],
      properties: Object.fromEntries(
        skillNames.map((skill) => [skill, { type: "number", description: "Delta from -2 to 2, 0 when no evidence this turn." }])
      ),
    },
  },
} as const;

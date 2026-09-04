import { z } from "zod";
import { runStructured } from "@/lib/ai/openai";

/**
 * What Sam does with a forwarded email.
 *
 * Not a translation: three things a person standing in front of an English
 * email actually needs — what it says, what they are being asked, and
 * something they can send back. The last one is the point of the feature and
 * has to be sendable as it stands, not a draft to fix.
 *
 * And two expressions, because this is a coach: the email somebody has to
 * answer today is better teaching material than any exercise, and it is the
 * difference between a translation tool and a lesson.
 */

const answerSchema = z.object({
  counterpart: z.string(),
  summaryIt: z.string(),
  asks: z.array(z.string()),
  replyEn: z.string(),
  expressions: z.array(z.object({ expression: z.string(), meaning: z.string() })),
});

export type MailAnswer = z.infer<typeof answerSchema>;

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["counterpart", "summaryIt", "asks", "replyEn", "expressions"],
  properties: {
    counterpart: { type: "string", description: "Who wrote the original email: name, or company, or empty if unclear." },
    summaryIt: { type: "string", description: "What the email says, in Italian, 2-4 sentences, plain language." },
    asks: {
      type: "array",
      description: "What the sender is actually asking for, in Italian. Between one and four items. Empty if they ask nothing.",
      items: { type: "string" },
    },
    replyEn: { type: "string", description: "A complete reply in English, ready to send." },
    expressions: {
      type: "array",
      description: "Exactly two useful expressions taken from this email, with a short Italian meaning.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["expression", "meaning"],
        properties: { expression: { type: "string" }, meaning: { type: "string" } },
      },
    },
  },
} as const;

function instructions(level: string, tone: string): string {
  return `You are Sam, the English coach inside ExecLingo, helping an Italian business professional deal with an email written in English. Their working level is ${level}.

Give them four things:
- counterpart: who wrote the original message. A forwarded email carries the sender's own name in the forwarded header inside the body — use that, not the person who forwarded it to you.
- summaryIt: what the email says, in Italian, in two to four sentences. Plain language, no jargon. If the email carries a deadline, a number or a price, that goes in.
- asks: what they are actually being asked to do or decide, in Italian, one short line each. If nothing is being asked, return an empty list rather than inventing something.
- replyEn: a reply in English they can send as it is. ${tone}

CRITICAL about the reply: write it as the user, in the first person, and never invent facts — no prices they did not mention, no dates they did not offer, no commitments they did not make. Where a real decision is needed, leave a clearly marked gap like [la tua data] or [il tuo prezzo] so they see exactly what to fill in. Match the register of the original: a lawyer gets formal English, a colleague gets a normal one. Keep it to the length the situation deserves — most business replies are four to eight lines.

Then expressions: exactly two phrases worth learning from this email — the kind that comes back in every negotiation or meeting — each with a short Italian meaning. Not basic vocabulary they already know.

Answer only with the JSON object.`;
}

export const TONES: Record<string, string> = {
  standard: "Professional and warm, the way a competent colleague writes.",
  firm: "Firmer and more direct: hold the position, no hedging, still polite.",
  soft: "Softer and more diplomatic: give room, soften the refusal, stay warm.",
  short: "As short as it can be while still being polite. Three lines at most.",
};

export async function answerMail(
  input: { subject: string; body: string; level: string; tone?: string; instruction?: string; previousReply?: string },
): Promise<MailAnswer> {
  const tone = TONES[input.tone ?? "standard"] ?? TONES.standard;
  const extra = input.instruction
    ? `\n\nThe user has asked for this specific change to the reply, in their own words — follow it exactly, in the reply only: "${input.instruction.slice(0, 400)}"`
    : "";
  const previous = input.previousReply
    ? `\n\nThe reply you wrote before, which you are now revising:\n${input.previousReply.slice(0, 2000)}`
    : "";

  const raw = await runStructured(
    instructions(input.level || "B1", tone) + extra,
    `Subject: ${input.subject || "(no subject)"}\n\n${input.body}${previous}`,
    "mail_answer",
    jsonSchema as unknown as Record<string, unknown>,
    1600
  );
  const parsed = answerSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("La risposta del coach non era leggibile.");
  return {
    ...parsed.data,
    asks: parsed.data.asks.slice(0, 4),
    expressions: parsed.data.expressions.slice(0, 2),
  };
}

import { z } from "zod";
import { runStructured } from "@/lib/ai/openai";

/**
 * What a work document is worth, as training material.
 *
 * The point is not to translate it. Somebody about to walk into a meeting
 * about this contract, this deck, this offer needs three things: to know what
 * it says, to own the eight or ten English words that will keep coming back
 * in the room, and to have already answered — out loud, badly, in private —
 * the questions they are about to be asked in public.
 *
 * The file itself is never kept. What survives is this: a few hundred words
 * that make a lesson possible, and no copy of somebody's contract on our
 * disks.
 */

export const MAX_PAGES = 10;
/** Roughly a ten-page PDF with figures; past this it is a different document. */
export const MAX_BYTES = 4_000_000;

const analysisSchema = z.object({
  pages: z.number().int().min(0),
  titleIt: z.string(),
  summaryIt: z.string(),
  kind: z.string(),
  terms: z.array(z.object({ term: z.string(), meaning: z.string() })),
  questions: z.array(z.string()),
  scenario: z.string(),
});

export type DocAnalysis = z.infer<typeof analysisSchema>;

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["pages", "titleIt", "summaryIt", "kind", "terms", "questions", "scenario"],
  properties: {
    pages: { type: "number", description: "How many pages the document actually has." },
    titleIt: { type: "string", description: "A short title in Italian, at most eight words." },
    summaryIt: { type: "string", description: "What the document says, in Italian, four to six sentences." },
    kind: { type: "string", description: "What kind of document it is, in Italian: contratto, offerta, presentazione, bilancio, capitolato…" },
    terms: {
      type: "array",
      description: "Between six and twelve English terms from this document that matter in the room, each with a short Italian meaning.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["term", "meaning"],
        properties: { term: { type: "string" }, meaning: { type: "string" } },
      },
    },
    questions: {
      type: "array",
      description: "Between three and six questions in English they are likely to be asked about this document.",
      items: { type: "string" },
    },
    scenario: {
      type: "string",
      description: "One line in English setting up the role-play: who the coach plays, and what the user has to achieve.",
    },
  },
} as const;

const INSTRUCTIONS = `You are Sam, the English coach inside ExecLingo. An Italian business professional has given you a document they will have to discuss in English — a contract, an offer, a deck, a set of figures — and you are preparing them for that conversation.

Read the document and produce:
- pages: how many pages it really has. Count them; do not guess.
- titleIt: a short title in Italian, at most eight words, naming this specific document rather than its category.
- kind: what kind of document it is, in Italian, one or two words.
- summaryIt: what it says, in Italian, four to six sentences. Include the numbers, dates and obligations that would matter in a meeting. Say only what is in the document.
- terms: six to twelve English expressions taken FROM THIS DOCUMENT that will come back in the room — the vocabulary of this deal, not general business English they already know. A short Italian meaning each.
- questions: three to six questions, in English, that they are realistically going to be asked about this document. The uncomfortable ones too.
- scenario: one line in English setting up a role-play — who you will play, and what they have to achieve.

If the document is unreadable, or has nothing to do with work, say so in summaryIt and return empty lists rather than inventing material.

Answer only with the JSON object.`;

export async function analyseDocument(file: { filename: string; base64: string }): Promise<DocAnalysis> {
  const raw = await runStructured(
    INSTRUCTIONS,
    "Prepara questo documento come materiale di allenamento.",
    "doc_analysis",
    jsonSchema as unknown as Record<string, unknown>,
    2000,
    file
  );
  const parsed = analysisSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("Non sono riuscito a leggere questo documento.");
  return {
    ...parsed.data,
    terms: parsed.data.terms.slice(0, 12),
    questions: parsed.data.questions.slice(0, 6),
  };
}

/**
 * A page count from the bytes, when the bytes are willing to say.
 *
 * Only ever used to refuse early. A PDF whose objects are compressed gives
 * nothing away here, and that is fine: the model counts the pages properly,
 * and the answer is checked again afterwards. Guessing high would reject
 * documents that are perfectly fine.
 */
export function countPagesRoughly(bytes: Buffer): number | null {
  const head = bytes.toString("latin1");
  const counted = head.match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
  return counted > 0 ? counted : null;
}

/** The one line of context a coaching session needs about the document. */
export function trainingContext(analysis: DocAnalysis): string {
  const terms = analysis.terms.map((t) => `${t.term} (${t.meaning})`).join("; ");
  const questions = analysis.questions.map((q) => `- ${q}`).join("\n");
  return `THE DOCUMENT THIS SESSION IS ABOUT
Kind: ${analysis.kind}. Title: ${analysis.titleIt}.
What it says (in Italian, for your understanding — speak English to the user): ${analysis.summaryIt}

Expressions from this document to teach and keep coming back to: ${terms}

Questions they are likely to be asked, and must be able to answer out loud:
${questions}

Role-play: ${analysis.scenario}

Run the session on THIS document. Do not drift onto general business English: every question, every correction and every expression should be one they will actually need in that room.`;
}

import { coachResultJsonSchema, coachResultSchema, type CoachResult } from "./types";

const RESPONSES_URL = "https://api.openai.com/v1/responses";

type ResponsesOutput = {
  output_text?: string;
  output?: { content?: { type?: string; text?: string }[] }[];
  status?: string;
  incomplete_details?: { reason?: string };
};

function extractText(json: ResponsesOutput): string {
  if (typeof json.output_text === "string" && json.output_text) return json.output_text;
  const chunks: string[] = [];
  for (const item of json.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

/**
 * One structured call to the Responses API. Returns the raw JSON text so each
 * caller can validate it with its own schema.
 */
export async function runStructured(
  instructions: string,
  input: string,
  schemaName: string,
  schema: Record<string, unknown>,
  maxOutputTokens = 1200
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");

  const response = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // Deliberately not moved to the 5.6 family: it is 1.6x-3x the price for
      // a turn that is already accurate. Revisit before 11 December 2026, when
      // the gpt-5 snapshot behind this alias is retired.
      model: process.env.OPENAI_MODEL || "gpt-5",
      instructions,
      input,
      reasoning: { effort: "low" },
      max_output_tokens: maxOutputTokens,
      text: { format: { type: "json_schema", name: schemaName, strict: true, schema } },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`OpenAI error ${response.status}: ${body.slice(0, 500)}`);
    throw new Error(`The coach is temporarily unavailable (upstream ${response.status}).`);
  }

  const json = (await response.json()) as ResponsesOutput;
  // A truncated answer is still valid JSON-shaped text right up to the cut, so
  // it fails to parse in a way that looks like a model error rather than a
  // budget one. Saying so here is what turns a mystery into a one-line fix.
  if (json.status === "incomplete") {
    console.error(
      `OpenAI response truncated (${json.incomplete_details?.reason ?? "unknown"}) for ${schemaName} at max_output_tokens=${maxOutputTokens}`
    );
  }
  return extractText(json).trim();
}

/**
 * Pulls the reply out of a structured answer that failed to parse.
 *
 * `reply` is the first property of the coach schema, so when the answer is cut
 * short — the usual cause — the sentence the user is waiting for has already
 * arrived in full and only the bookkeeping after it is missing. Reading it
 * back out is the difference between a normal conversation and a wall of
 * machine output.
 */
export function salvageReply(raw: string): string | null {
  const match = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!match) return null;
  try {
    const text = JSON.parse(`"${match[1]}"`) as string;
    return text.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Runs one coaching turn via the OpenAI Responses API with a strict
 * structured-output schema, then validates the result with Zod.
 */
export async function runCoach(instructions: string, input: string): Promise<CoachResult> {
  // A coach turn carries the reply plus corrections, mistakes, expressions and
  // skill updates, and reasoning tokens are spent from the same budget. At the
  // old ceiling the JSON was being cut off mid-object often enough to reach
  // real users.
  const raw = await runStructured(instructions, input, "coach_turn", coachResultJsonSchema, 2600);
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return coachResultSchema.parse(JSON.parse(cleaned));
  } catch {
    // The structure slipped. Recover the sentence Sam meant to say and drop
    // the rest: the corrections and the skill updates are worth losing, the
    // conversation is not. What must never happen is showing the raw answer —
    // a learner who asked a question in English and received a wall of JSON
    // has been told the product is broken, whatever the reply said.
    console.error(`coach turn unparseable (${cleaned.length} chars); falling back to the reply alone`);
    const reply = salvageReply(cleaned);
    return coachResultSchema.parse({
      reply: reply ?? "Sorry — I lost that one. Could you say it again?\n(Scusa, non l\u2019ho ricevuta: puoi ripetere?)",
    });
  }
}

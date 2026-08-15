import { coachResultJsonSchema, coachResultSchema, type CoachResult } from "./types";

const RESPONSES_URL = "https://api.openai.com/v1/responses";

type ResponsesOutput = {
  output_text?: string;
  output?: { content?: { type?: string; text?: string }[] }[];
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

  return extractText((await response.json()) as ResponsesOutput).trim();
}

/**
 * Runs one coaching turn via the OpenAI Responses API with a strict
 * structured-output schema, then validates the result with Zod.
 */
export async function runCoach(instructions: string, input: string): Promise<CoachResult> {
  const raw = await runStructured(instructions, input, "coach_turn", coachResultJsonSchema);
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return coachResultSchema.parse(JSON.parse(cleaned));
  } catch {
    // Defensive fallback: never lose the reply just because structure slipped.
    return coachResultSchema.parse({ reply: raw || "Sorry, could you say that again?" });
  }
}

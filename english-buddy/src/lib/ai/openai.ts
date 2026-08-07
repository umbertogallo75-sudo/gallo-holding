import type { CoachResult } from "./types";

function extractText(json: any): string {
  if (typeof json?.output_text === "string") return json.output_text;
  const chunks: string[] = [];
  for (const item of json?.output || []) for (const content of item?.content || []) if (typeof content?.text === "string") chunks.push(content.text);
  return chunks.join("\n");
}

export async function runCoach(instructions: string, input: string): Promise<CoachResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5-mini", instructions, input }),
  });
  if (!response.ok) throw new Error(`OpenAI error ${response.status}: ${await response.text()}`);
  const raw = extractText(await response.json()).trim();
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(cleaned) as CoachResult; }
  catch { return { reply: raw, mistakes: [], expressions: [], skill_updates: {} }; }
}

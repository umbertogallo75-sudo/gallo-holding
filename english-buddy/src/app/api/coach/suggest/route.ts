import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

const bodySchema = z.object({
  question: z.string().trim().min(1).max(600),
  mode: z.string().max(20).optional(),
});

const FALLBACK = ["I'm sorry, I don't understand. Can you repeat that?", "I'm not sure. Can you help me?", "Can you say that more slowly, please?"];

/**
 * "I don't know what to say": returns 2-3 ready answers to the coach's last
 * question, matched to the user's level. Learning support, not failure.
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(clientKey(request, "suggest"), 15, 60_000).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ suggestions: FALLBACK });

  const stateResult = await db().execute({
    sql: "SELECT ls.cefr_level, p.professional_context FROM learning_state ls LEFT JOIN profiles p ON p.id = ls.user_id WHERE ls.user_id = ? LIMIT 1",
    args: [userId],
  });
  const level = stateResult.rows[0]?.cefr_level ? String(stateResult.rows[0].cefr_level) : "A2";
  const context = stateResult.rows[0]?.professional_context ? String(stateResult.rows[0].professional_context) : "";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-sol",
        instructions: `An Italian ${level}-level English learner doesn't know how to answer their coach's question. Suggest exactly 3 short, natural example answers in English they could give, matched to their level (simple for A1/A2). First person, ready to use, max 14 words each, no numbering.${context ? ` Their background: ${context}.` : ""}`,
        input: `The coach asked: ${parsed.data.question}`,
        reasoning: { effort: "low" },
        // Reasoning shares this budget: a tight cap intermittently truncates
        // the JSON and silently downgrades to the static fallback list.
        max_output_tokens: 1600,
        text: {
          format: {
            type: "json_schema",
            name: "suggestions",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["suggestions"],
              properties: { suggestions: { type: "array", items: { type: "string" }, description: "Exactly 3 example answers." } },
            },
          },
        },
      }),
    });
    if (!response.ok) return NextResponse.json({ suggestions: FALLBACK });
    const json = (await response.json()) as { output_text?: string; output?: { content?: { text?: string }[] }[] };
    const raw = (json.output_text || json.output?.flatMap((o) => o.content || []).map((c) => c.text || "").join(" ") || "").trim();
    const suggestions = z.object({ suggestions: z.array(z.string().min(1).max(200)).min(1).max(5) }).parse(JSON.parse(raw)).suggestions;
    return NextResponse.json({ suggestions: suggestions.slice(0, 3) });
  } catch {
    return NextResponse.json({ suggestions: FALLBACK });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureProfile, recordDailyMetric, saveExpression, saveMistake } from "@/lib/learning/service";
import { randomUUID } from "node:crypto";

export const maxDuration = 30;

const bodySchema = z.object({
  seconds: z.number().int().min(1).max(1800),
  transcript: z
    .array(z.object({ role: z.enum(["you", "coach"]), text: z.string().max(400) }))
    .max(40)
    .optional(),
});

/**
 * Logs a finished voice conversation (minutes + session row) and, when a
 * transcript is available, extracts the few mistakes/expressions worth
 * remembering so spaced repetition brings them back in later sessions —
 * the voice coach itself never loops on them in the moment.
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { seconds, transcript } = parsed.data;
  const minutes = Math.max(1, Math.round(seconds / 60));
  await ensureProfile(userId);
  const now = new Date();
  await db().execute({
    sql: "INSERT INTO sessions (id, user_id, mode, started_at, ended_at) VALUES (?, ?, 'voice', ?, ?)",
    args: [randomUUID(), userId, new Date(now.getTime() - seconds * 1000).toISOString(), now.toISOString()],
  });
  await recordDailyMetric(userId, { minutes, interactions: 1 });

  let remembered = 0;
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey && transcript && transcript.length >= 2) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-5.6-sol",
          instructions:
            "From this spoken-English practice transcript, extract ONLY clearly worthwhile learning items for an Italian professional: up to 2 real mistakes the learner made (with the natural correction) and up to 2 useful expressions the coach taught. Ignore transcription noise and pronunciation slips. Empty arrays are fine.",
          input: transcript.map((l) => `${l.role === "you" ? "LEARNER" : "COACH"}: ${l.text}`).join("\n"),
          reasoning: { effort: "low" },
          // Reasoning shares this budget; too tight and the JSON truncates,
          // silently skipping the memory extraction.
          max_output_tokens: 1800,
          text: {
            format: {
              type: "json_schema",
              name: "voice_review",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["mistakes", "expressions"],
                properties: {
                  mistakes: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["incorrect", "correct"],
                      properties: { incorrect: { type: "string" }, correct: { type: "string" } },
                    },
                  },
                  expressions: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        }),
      });
      if (response.ok) {
        const json = (await response.json()) as { output_text?: string; output?: { content?: { text?: string }[] }[] };
        const raw = (json.output_text || json.output?.flatMap((o) => o.content || []).map((c) => c.text || "").join(" ") || "").trim();
        const review = z
          .object({
            mistakes: z.array(z.object({ incorrect: z.string().min(1).max(200), correct: z.string().min(1).max(200) })).max(3),
            expressions: z.array(z.string().min(1).max(200)).max(3),
          })
          .parse(JSON.parse(raw));
        for (const mistake of review.mistakes.slice(0, 2)) {
          await saveMistake(userId, { ...mistake, category: "other", severity: "meaningful", note: "from voice session" });
          remembered++;
        }
        for (const expression of review.expressions.slice(0, 2)) {
          await saveExpression(userId, expression, null);
          remembered++;
        }
      }
    } catch {
      // Memory extraction is best-effort; the session itself is already logged.
    }
  }

  return NextResponse.json({ ok: true, minutes, remembered });
}

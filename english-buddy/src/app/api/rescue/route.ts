import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { billingEnforced, getEntitlement, PAYWALL_MESSAGE } from "@/lib/stripe";
import { ANDROID_PAYWALL_MESSAGE, EMBEDDED_PAYWALL_MESSAGE, embeddedShellOf } from "@/lib/appclient";
import { ensureProfile, saveExpression } from "@/lib/learning/service";
import { modelFor } from "@/lib/ai/models";

export const maxDuration = 30;

const translateSchema = z.object({ text: z.string().trim().min(1).max(600) });
const saveSchema = z.object({ expression: z.string().trim().min(1).max(300), meaning: z.string().trim().max(300).default("") });

/**
 * English Rescue: the user is in a real situation and needs to say something
 * NOW. Italian in → three English registers out (simple / natural / business).
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (billingEnforced() && !(await getEntitlement(userId)).access) {
    return NextResponse.json({ error: embeddedShellOf(request) === "android" ? ANDROID_PAYWALL_MESSAGE : embeddedShellOf(request) === "ios" ? EMBEDDED_PAYWALL_MESSAGE : PAYWALL_MESSAGE, upgradeUrl: "/abbonamento" }, { status: 402 });
  }
  if (!rateLimit(clientKey(request, "rescue"), 15, 60_000).allowed) {
    return NextResponse.json({ error: "Too many requests. Give it a few seconds." }, { status: 429 });
  }

  const parsed = translateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Rescue is not configured" }, { status: 500 });

  const stateResult = await db().execute({ sql: "SELECT cefr_level FROM learning_state WHERE user_id = ? LIMIT 1", args: [userId] });
  const level = stateResult.rows[0]?.cefr_level ? String(stateResult.rows[0].cefr_level) : "B1";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelFor("text"),
        instructions: `Translate what an Italian professional wants to say into English in three registers:
- simple: short, easy words, easy to pronounce (for a ${level} learner to say aloud right now)
- natural: how a fluent speaker would naturally say it
- business: polished professional register for meetings/emails/negotiations
Keep the meaning faithful. No quotes, no explanations.`,
        input: parsed.data.text,
        reasoning: { effort: "low" },
        // Reasoning is spent from this budget, and a stronger model thinks
        // more before it answers. Unused headroom is free; a truncated answer
        // is not.
        max_output_tokens: 1200,
        text: {
          format: {
            type: "json_schema",
            name: "rescue",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["simple", "natural", "business"],
              properties: {
                simple: { type: "string" },
                natural: { type: "string" },
                business: { type: "string" },
              },
            },
          },
        },
      }),
    });
    if (!response.ok) return NextResponse.json({ error: "Rescue is temporarily unavailable" }, { status: 502 });
    const json = (await response.json()) as { output_text?: string; output?: { content?: { text?: string }[] }[] };
    const raw = (json.output_text || json.output?.flatMap((o) => o.content || []).map((c) => c.text || "").join(" ") || "").trim();
    const result = z.object({ simple: z.string(), natural: z.string(), business: z.string() }).parse(JSON.parse(raw));
    // The business version goes into spaced repetition on its own: a phrase
    // somebody needed in a real moment is the best review material there is,
    // and asking them to tap "save" while they are mid-meeting loses it.
    await ensureProfile(userId);
    await saveExpression(userId, result.business, parsed.data.text.slice(0, 300)).catch(() => undefined);
    return NextResponse.json({ ...result, level });
  } catch {
    return NextResponse.json({ error: "Rescue is temporarily unavailable" }, { status: 502 });
  }
}

/** Save a rescue phrase into the learning memory for future review. */
export async function PUT(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  await ensureProfile(userId);
  await saveExpression(userId, parsed.data.expression, parsed.data.meaning || null);
  return NextResponse.json({ ok: true });
}

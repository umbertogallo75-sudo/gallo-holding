import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { coachInstructions } from "@/lib/ai/prompt";
import { runCoach } from "@/lib/ai/openai";
import {
  ensureProfile,
  getRelevantLearningContext,
  recordDailyMetric,
  recordReviewResult,
  saveExpression,
  saveMessage,
  saveMistake,
  startSession,
  touchSession,
  updateSkillEstimate,
} from "@/lib/learning/service";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
  mode: z.enum(["text-2", "text-5", "guided", "surprise", "buddy", "essentials"]).default("text-5"),
  sessionId: z.string().uuid().optional(),
  // A Buddy question delivered via push, shown client-side before the first
  // reply; recorded as the session's opening assistant turn.
  opener: z.string().trim().max(500).optional(),
});

const modeMinutes: Record<string, number> = { "text-2": 2, "text-5": 5, guided: 10, surprise: 5, buddy: 3, essentials: 7 };

export async function POST(request: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!rateLimit(clientKey(request, "coach"), 20, 60_000).allowed) {
      return NextResponse.json({ error: "Too many requests. Give it a few seconds." }, { status: 429 });
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const { message, mode } = parsed.data;

    let sessionId = parsed.data.sessionId;
    if (!sessionId) {
      await ensureProfile(userId);
      sessionId = await startSession(userId, mode);
      if (parsed.data.opener) await saveMessage(userId, sessionId, "assistant", parsed.data.opener);
    }
    await saveMessage(userId, sessionId, "user", message);

    const context = await getRelevantLearningContext(userId, sessionId);
    const result = await runCoach(coachInstructions(context, mode), message);

    await saveMessage(userId, sessionId, "assistant", result.reply, result.correction || null);
    await touchSession(userId, sessionId);

    for (const mistake of result.mistakes) await saveMistake(userId, mistake);
    for (const expression of result.expressions) await saveExpression(userId, expression.expression, expression.meaning || null);

    let reviewed = 0;
    for (const item of result.reviewed_items) {
      if (await recordReviewResult(userId, item.text, item.success)) reviewed++;
    }

    await updateSkillEstimate(userId, result.skill_updates);
    await recordDailyMetric(userId, {
      minutes: modeMinutes[mode] ?? 5,
      interactions: 1,
      expressionsReviewed: reviewed,
    });

    return NextResponse.json({
      sessionId,
      reply: result.reply,
      correction: result.correction || undefined,
    });
  } catch (error) {
    console.error("coach route error:", error);
    return NextResponse.json({ error: "The coach hit a problem. Please try again." }, { status: 500 });
  }
}

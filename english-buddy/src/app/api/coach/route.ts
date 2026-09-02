import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { billingEnforced, getEntitlement, PAYWALL_MESSAGE } from "@/lib/stripe";
import { ANDROID_PAYWALL_MESSAGE, EMBEDDED_PAYWALL_MESSAGE, embeddedShellOf } from "@/lib/appclient";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { coachInstructions } from "@/lib/ai/prompt";
import { runCoach } from "@/lib/ai/openai";
import { COACH_MODES, MODE_MINUTES } from "@/lib/learning/modes";
import { ensureTrial } from "@/lib/marketing/trial";
import { isFirstSession } from "@/lib/learning/first-use";
import {
  ensureProfile,
  ensureWeeklyFocus,
  getRelevantLearningContext,
  maybeAdjustLevel,
  saveCapabilities,
  recordDailyMetric,
  recordReviewResult,
  saveExpression,
  saveMessage,
  saveMistake,
  startSession,
  touchSession,
  updateSkillEstimate,
} from "@/lib/learning/service";

// LLM turns can exceed Vercel's 10s default; without this the platform kills
// the function mid-response and the phone sees a bare "Load failed".
export const maxDuration = 60;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
  mode: z.enum(COACH_MODES).default("text-5"),
  sessionId: z.string().uuid().optional(),
  // A Buddy question delivered via push, shown client-side before the first
  // reply; recorded as the session's opening assistant turn.
  opener: z.string().trim().max(500).optional(),
});



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

    // The 3-minute level check promised on the landing stays free; every other
    // activity requires a plan (or an admin-granted free account).
    if (billingEnforced() && mode !== "levelcheck") {
      let entitlement = await getEntitlement(userId);

      // Nobody should meet the paywall before they have met Sam. Opening a
      // conversation is what starts the free trial — the emailed link and the
      // button on the home screen still work, but they were the only two ways
      // in and most people saw neither.
      if (!entitlement.access) {
        await ensureTrial(userId).catch(() => null);
        entitlement = await getEntitlement(userId);
      }

      // And the very first session is free whatever happens, as promised when
      // the path was designed. Counted on the server from the sessions table,
      // not taken from a query parameter the browser could invent.
      if (!entitlement.access && !(await isFirstSession(userId))) {
        return NextResponse.json({ error: embeddedShellOf(request) === "android" ? ANDROID_PAYWALL_MESSAGE : embeddedShellOf(request) === "ios" ? EMBEDDED_PAYWALL_MESSAGE : PAYWALL_MESSAGE, upgradeUrl: "/abbonamento" }, { status: 402 });
      }
    }

    let sessionId = parsed.data.sessionId;
    if (!sessionId) {
      await ensureProfile(userId);
      sessionId = await startSession(userId, mode);
      if (parsed.data.opener) await saveMessage(userId, sessionId, "assistant", parsed.data.opener);
    }
    await saveMessage(userId, sessionId, "user", message);

    await ensureWeeklyFocus(userId);
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
    if (result.capabilities.length) await saveCapabilities(userId, result.capabilities.slice(0, 3));
    await maybeAdjustLevel(userId);
    await recordDailyMetric(userId, {
      minutes: MODE_MINUTES[mode] ?? 5,
      interactions: 1,
      expressionsReviewed: reviewed,
    });

    return NextResponse.json({
      sessionId,
      reply: result.reply,
      correction: result.correction || undefined,
      // The model already works out exactly what was wrong and which phrase is
      // worth keeping; both were being written to the database and never shown.
      // A learner reading "Better: ..." cannot see what they actually said.
      // One of each: a chat turn is not a report card.
      mistake: result.mistakes[0]
        ? { incorrect: result.mistakes[0].incorrect, correct: result.mistakes[0].correct, note: result.mistakes[0].note || undefined }
        : undefined,
      expression: result.expressions[0]
        ? { expression: result.expressions[0].expression, meaning: result.expressions[0].meaning || undefined }
        : undefined,
    });
  } catch (error) {
    console.error("coach route error:", error);
    return NextResponse.json({ error: "The coach hit a problem. Please try again." }, { status: 500 });
  }
}

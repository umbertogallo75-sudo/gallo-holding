import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { billingEnforced, getEntitlement, PAYWALL_MESSAGE } from "@/lib/stripe";
import { ANDROID_PAYWALL_MESSAGE, EMBEDDED_PAYWALL_MESSAGE, embeddedShellOf } from "@/lib/appclient";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { coachInstructions } from "@/lib/ai/prompt";
import { runCoach, runOpening } from "@/lib/ai/openai";
import { readDocument } from "@/lib/documents/store";
import { trainingContext } from "@/lib/documents/analyse";
import { COACH_MODES, MODE_MINUTES } from "@/lib/learning/modes";
import { ensureTrial } from "@/lib/marketing/trial";
import { isFirstSession } from "@/lib/learning/first-use";
import { trackEvent } from "@/lib/analytics";
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
  /** The automatic first line, which has nothing to correct yet. */
  opening: z.boolean().optional(),
  /** A document this session is built on, if the user chose one. */
  doc: z.string().trim().max(64).optional(),
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
        // The refusal itself, counted. A funnel that records purchases but not
        // the moment somebody was stopped cannot say where it loses people.
        await trackEvent("paywall_shown", { userId, meta: { mode } });
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
    const firstEver = !parsed.data.sessionId && (await isFirstSession(userId));
    // A session about a document carries the document with it. Read here
    // rather than trusted from the client: the summary is ours, and it is only
    // ever the one belonging to the person asking.
    let docContext: string | undefined;
    if (parsed.data.doc) {
      const doc = await readDocument(parsed.data.doc, userId).catch(() => null);
      if (doc) docContext = trainingContext(doc.analysis);
    }
    // The greeting is asked for as a greeting: seven fields of coaching output
    // on a turn where the user has not spoken yet is a wait paid for nothing.
    const instructions = coachInstructions(context, mode, docContext);
    const result = parsed.data.opening && !parsed.data.sessionId
      ? { reply: await runOpening(instructions, message), correction: null, mistakes: [], expressions: [], reviewed_items: [], skill_updates: {}, capabilities: [] }
      : await runCoach(instructions, message);
    // The aha moment, and the only one that counts: an answer that came back.
    // "Session started" was already recorded and told us nothing, because a
    // session that fails on the first turn starts exactly the same way.
    if (firstEver) await trackEvent("first_reply_ok", { userId, meta: { mode } });

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

import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { appendVoiceLines, ensureVoiceSession } from "@/lib/learning/voice-sessions";

export const maxDuration = 15;

/**
 * What was said, saved while the call is still going.
 *
 * The transcript used to leave on hang-up and only on hang-up — one beacon,
 * at the end, from a page the operating system is free to kill at any moment.
 * Every way a call actually ends on a phone (it locks, a real call arrives,
 * the app is swiped away) is a way that beacon never leaves, and the whole
 * conversation went with it. So the lines come in as they are spoken, and
 * hanging up has nothing left to lose.
 */
const bodySchema = z.object({
  sessionId: z.string().min(8).max(64).nullable().optional(),
  mode: z.string().max(24).optional(),
  /** Which leg of the conversation this is: a call can be picked up twice. */
  leg: z.string().max(16).optional(),
  /** The caller's own line number for the first line in this batch. */
  from: z.number().int().min(0).max(10_000),
  lines: z
    .array(z.object({ role: z.enum(["you", "coach"]), text: z.string().min(1).max(2000) }))
    .min(1)
    .max(40),
});

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Generous: a long call flushes every few seconds, and losing a flush to a
  // limit would lose exactly the lines this route exists to keep.
  if (!rateLimit(clientKey(request, "voice-turns"), 240, 60 * 60_000).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { sessionId, mode, leg, from, lines } = parsed.data;
  const id = await ensureVoiceSession(userId, mode ?? "voice", sessionId ?? null);
  const saved = await appendVoiceLines(userId, id, leg ?? "a", from, lines);
  return NextResponse.json({ ok: true, sessionId: id, saved });
}

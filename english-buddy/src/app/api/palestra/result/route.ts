import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { trackEvent } from "@/lib/analytics";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { recordReviewResult } from "@/lib/learning/service";
import { findGame } from "@/lib/games/catalog";

const bodySchema = z.object({
  game: z.string().trim().min(1).max(40),
  score: z.number().int().min(0).max(100_000),
  correct: z.number().int().min(0).max(100),
  total: z.number().int().min(0).max(100),
  /** One entry per round played on the learner's own material. */
  items: z
    .array(z.object({ itemText: z.string().trim().min(1).max(400), success: z.boolean() }))
    .max(50)
    .default([]),
});

/**
 * The end of a game. Anything played on the learner's own mistakes or
 * expressions is fed back into spaced repetition — a word rebuilt in time
 * counts as a successful review, a word missed brings the item forward — so
 * playing is practising rather than a diversion from it.
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(clientKey(request, "game-result"), 60, 60 * 60_000).allowed) {
    return NextResponse.json({ ok: true, reviewed: 0 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  const { game, score, correct, total, items } = parsed.data;
  if (!findGame(game)) return NextResponse.json({ error: "Gioco sconosciuto" }, { status: 400 });

  let reviewed = 0;
  for (const item of items) {
    // One at a time and never fatal: a review that cannot be written must not
    // cost the player their score.
    const applied = await recordReviewResult(userId, item.itemText, item.success).catch(() => false);
    if (applied) reviewed += 1;
  }

  await trackEvent("game_finished", { userId, meta: { game, score, correct, total, reviewed } }).catch((error) =>
    console.error("game tracking failed:", error)
  );

  return NextResponse.json({ ok: true, reviewed });
}

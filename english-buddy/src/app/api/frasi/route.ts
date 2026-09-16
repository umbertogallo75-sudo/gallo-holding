import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { ensureProfile, saveExpression } from "@/lib/learning/service";
import { runStructured } from "@/lib/ai/openai";

export const maxDuration = 20;

/**
 * "Ricorda questa frase."
 *
 * The phrasebook existed, but only Sam could put anything in it: he recorded
 * the expressions he judged worth keeping, and the learner had no way to say
 * "that one — that is the sentence I have been trying to find for a month".
 * Testers asked for it in both places they meet English, writing and speech,
 * which is why this takes a plain sentence and nothing else.
 *
 * The phrase is saved first and translated afterwards. A save that waits for a
 * model call is a save that can fail, and losing the sentence somebody just
 * reached for is far worse than showing it without its Italian for a moment.
 */
const bodySchema = z.object({
  text: z.string().trim().min(2).max(300),
  /** Where it was said, for nothing more than knowing which surface is used. */
  from: z.enum(["chat", "voice", "transcript"]).optional(),
});

const MEANING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["italian"],
  properties: { italian: { type: "string" } },
} as const;

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(clientKey(request, "frasi"), 60, 60 * 60_000).allowed) {
    return NextResponse.json({ error: "Troppe frasi in poco tempo — riprova tra un po'." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Frase non valida" }, { status: 400 });
  const text = parsed.data.text.replace(/\s+/g, " ").trim();

  await ensureProfile(userId);
  await saveExpression(userId, text, null);

  // The Italian, afterwards and best-effort: the phrase is already safe.
  after(async () => {
    if (!process.env.OPENAI_API_KEY) return;
    try {
      const raw = await runStructured(
        "Translate the English phrase into natural Italian, as a professional would say it. One short line, no quotes, no explanation. If the phrase is already Italian, give the natural English instead.",
        text,
        "phrase_meaning",
        MEANING_SCHEMA,
        300
      );
      const italian = String(JSON.parse(raw).italian ?? "").trim().slice(0, 300);
      if (!italian) return;
      await db().execute({
        sql: "UPDATE expressions SET meaning = COALESCE(meaning, ?) WHERE user_id = ? AND expression = ?",
        args: [italian, userId, text],
      });
    } catch {
      // The phrase stays in the phrasebook without its translation, which is
      // the part that mattered.
    }
  });

  return NextResponse.json({ ok: true, saved: text });
}

/** What is in the phrasebook, newest first. */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await db()
    .execute({
      sql: "SELECT expression, meaning FROM expressions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
      args: [userId],
    })
    .catch(() => null);
  return NextResponse.json({
    phrases: (result?.rows ?? []).map((row) => ({
      text: String(row.expression),
      meaning: row.meaning ? String(row.meaning) : null,
    })),
  });
}

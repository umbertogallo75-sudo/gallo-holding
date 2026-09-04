import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { answerMail, TONES } from "@/lib/mail/process";
import { attachAnswer, deleteMail, readMail, rememberSender, replaceReply } from "@/lib/mail/store";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["retry", "tone", "instruct", "trust"]),
  tone: z.enum(["standard", "firm", "soft", "short"]).optional(),
  instruction: z.string().max(400).optional(),
});

/**
 * Everything you can do to one forwarded email once it is in the app.
 *
 * The interesting one is `instruct`: "tell him we can't before Monday". It
 * rewrites only the reply, keeping the summary and what is being asked, since
 * those are facts about the incoming message and do not change because the
 * user changed their mind about the answer.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });

  const client = db();
  const item = await readMail(id, userId, client);
  if (!item) return NextResponse.json({ error: "Non trovata" }, { status: 404 });

  if (parsed.data.action === "trust") {
    await rememberSender(userId, item.fromAddress, client);
    return NextResponse.json({ ok: true });
  }

  // The original text is dropped after a month, so a rewrite that late has
  // nothing to work from. Saying so beats quietly producing something worse.
  if (!item.bodyText) {
    return NextResponse.json(
      { error: "Il testo originale di questa email non è più conservato: puoi ancora leggere e copiare la risposta." },
      { status: 409 }
    );
  }

  const state = await client
    .execute({ sql: "SELECT cefr_level FROM learning_state WHERE user_id = ? LIMIT 1", args: [userId] })
    .catch(() => ({ rows: [] as Record<string, unknown>[] }));
  const level = state.rows[0]?.cefr_level ? String(state.rows[0].cefr_level) : "B1";

  try {
    const answer = await answerMail({
      subject: item.subject,
      body: item.bodyText,
      level,
      tone: parsed.data.tone && parsed.data.tone in TONES ? parsed.data.tone : "standard",
      instruction: parsed.data.action === "instruct" ? parsed.data.instruction : undefined,
      previousReply: parsed.data.action === "retry" ? undefined : item.replyEn,
    });
    // A retry rebuilds the lot; a tone change or an instruction touches only
    // the reply, because what the email says has not changed.
    if (parsed.data.action === "retry") await attachAnswer(id, answer, client);
    else await replaceReply(id, userId, answer.replyEn, client);
    return NextResponse.json({ ok: true, reply: answer.replyEn, summaryIt: answer.summaryIt, asks: answer.asks });
  } catch (error) {
    console.error("mail rewrite failed:", error);
    return NextResponse.json({ error: "Sam non è riuscito a rispondere adesso. Riprova fra un attimo." }, { status: 502 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await context.params;
  await deleteMail(id, userId);
  return NextResponse.json({ ok: true });
}

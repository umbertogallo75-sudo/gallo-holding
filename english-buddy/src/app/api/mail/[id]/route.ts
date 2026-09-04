import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { answerMail, TONES } from "@/lib/mail/process";
import { attachAnswer, deleteMail, readMail, rememberSender, replaceReply } from "@/lib/mail/store";
import { renderEmail, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["retry", "tone", "instruct", "trust", "email"]),
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

  if (parsed.data.action === "email") {
    // Where it is allowed to go: the address on the account, or — failing that
    // — an address this person has already vouched for on this very message.
    // Never anywhere else: a reply sent to an unverified From line is a reply
    // sent to whoever forged it.
    const account = await client
      .execute({ sql: "SELECT email FROM auth_users WHERE id = ? LIMIT 1", args: [userId] })
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));
    const target = account.rows[0]?.email ? String(account.rows[0].email) : item.senderKnown ? item.fromAddress : "";
    if (!target) {
      return NextResponse.json(
        {
          error:
            "Non ho un indirizzo a cui mandarla: il tuo account non ne ha uno registrato. Tocca «È mio» qui sopra per riconoscere l'indirizzo da cui hai inoltrato, e riprova.",
        },
        { status: 409 }
      );
    }
    const sent = await sendReply(target, item.subject, item.summaryIt, item.asks, item.replyEn, id);
    if (!sent) {
      return NextResponse.json({ error: "L'invio non è riuscito. Riprova fra un momento." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sentTo: target });
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

/** The answer, in the inbox where the original is already open. */
async function sendReply(
  to: string,
  subject: string,
  summaryIt: string,
  asks: string[],
  replyEn: string,
  id: string
): Promise<boolean> {
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const askList = asks.length
    ? `<ul style="margin:0 0 18px;padding-left:20px;color:#3d453e;font-size:15px;line-height:1.6;">${asks
        .map((ask) => `<li>${escape(ask)}</li>`)
        .join("")}</ul>`
    : "";
  const html = renderEmail({
    preheader: "La risposta pronta da copiare",
    heading: "Ecco cosa dice, e cosa puoi rispondere",
    bodyHtml:
      `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3d453e;">${escape(summaryIt)}</p>` +
      askList +
      `<p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.06em;color:#2f8f63;">LA TUA RISPOSTA</p>` +
      `<div style="white-space:pre-wrap;background:#f6f6f2;border-radius:10px;padding:16px;font-size:15px;line-height:1.6;color:#18201a;">${escape(
        replyEn
      )}</div>`,
    ctaLabel: "Cambiala con Sam",
    ctaUrl: `https://www.execlingo.it/mail/${id}`,
    footerNote:
      "Hai ricevuto questa email perché l'hai chiesta dall'app, su una mail che avevi inoltrato al tuo indirizzo personale ExecLingo.",
  });
  return sendEmail(to, `Risposta pronta: ${subject || "la tua mail"}`, html, `${summaryIt}\n\n${replyEn}`);
}

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseInbound } from "@/lib/mail/inbound";
import { answerMail } from "@/lib/mail/process";
import { attachAnswer, markFailed, saveIncoming, senderIsKnown, userForAlias } from "@/lib/mail/store";
import { renderEmail, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Where a forwarded email lands.
 *
 * Called by whichever service receives mail for the inbound subdomain. Two
 * rules shape everything here:
 *
 * The endpoint is shared-secret only. It is a public URL that writes to a
 * user's account, so without the secret it must do nothing at all.
 *
 * And it almost never returns an error. A mail relay treats a failure as
 * "try again", so a message for an address that does not exist would be
 * redelivered for days; worse, a 404 for an unknown alias and a 200 for a
 * real one is an oracle for guessing addresses. Anything unrecognised is
 * accepted and dropped.
 */

function authorised(request: Request): boolean {
  const expected = process.env.MAIL_INBOUND_SECRET?.trim();
  if (!expected) return false;
  const url = new URL(request.url);
  const given = (request.headers.get("x-execlingo-secret") || url.searchParams.get("key") || "").trim();
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function POST(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: true, ignored: "unparseable" });
  }

  const mail = parseInbound(payload);
  if (!mail || !mail.text) return NextResponse.json({ ok: true, ignored: "empty" });

  const client = db();
  const userId = await userForAlias(mail.toAlias, client);
  if (!userId) return NextResponse.json({ ok: true, ignored: "unknown" });

  // The address they registered with, and the level the coach has settled on:
  // one tells us whether this sender is already theirs, the other decides how
  // hard the English of the reply is allowed to be.
  const [account, state] = await Promise.all([
    client.execute({ sql: "SELECT email FROM auth_users WHERE id = ? LIMIT 1", args: [userId] }).catch(() => ({ rows: [] })),
    client.execute({ sql: "SELECT cefr_level FROM learning_state WHERE user_id = ? LIMIT 1", args: [userId] }).catch(() => ({ rows: [] })),
  ]);
  const accountEmail = account.rows[0]?.email ? String(account.rows[0].email) : null;
  const level = state.rows[0]?.cefr_level ? String(state.rows[0].cefr_level) : "B1";

  const known = await senderIsKnown(userId, mail.fromAddress, accountEmail, client);
  const id = await saveIncoming(
    {
      userId,
      fromAddress: mail.fromAddress,
      fromName: mail.fromName,
      subject: mail.subject,
      bodyText: mail.text,
      senderKnown: known,
    },
    client
  );

  // Answered here rather than on a queue: the person has just pressed forward
  // and is looking at their phone. If it fails the item stays in the list
  // marked as such, and opening it tries again — nothing is lost either way.
  try {
    const answer = await answerMail({ subject: mail.subject, body: mail.text, level });
    await attachAnswer(id, answer, client);
    // The answer also goes back by email, because the person who forwarded
    // this is standing in their mail client with the original open. Asking
    // them to switch to an app to copy four lines is asking them not to
    // bother; the app is where the history and the rewriting live.
    if (accountEmail) await sendReplyBack(accountEmail, mail.subject, answer, id);
  } catch (error) {
    console.error("mail answer failed:", error);
    await markFailed(id, client);
  }

  return NextResponse.json({ ok: true, id });
}

/** The same answer, in the place they are already working. */
async function sendReplyBack(
  to: string,
  subject: string,
  answer: { summaryIt: string; asks: string[]; replyEn: string },
  id: string
): Promise<void> {
  const escape = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const asks = answer.asks.length
    ? `<ul style="margin:0 0 18px;padding-left:20px;color:#3d453e;font-size:15px;line-height:1.6;">${answer.asks
        .map((ask) => `<li>${escape(ask)}</li>`)
        .join("")}</ul>`
    : "";
  const html = renderEmail({
    preheader: "La risposta pronta da copiare",
    heading: "Ecco cosa dice, e cosa puoi rispondere",
    bodyHtml:
      `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3d453e;">${escape(answer.summaryIt)}</p>` +
      asks +
      `<p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.06em;color:#2f8f63;">LA TUA RISPOSTA</p>` +
      `<div style="white-space:pre-wrap;background:#f6f6f2;border-radius:10px;padding:16px;font-size:15px;line-height:1.6;color:#18201a;">${escape(
        answer.replyEn
      )}</div>`,
    ctaLabel: "Cambiala con Sam",
    ctaUrl: `https://www.execlingo.it/mail/${id}`,
    footerNote:
      "Hai ricevuto questa email perché hai inoltrato un messaggio al tuo indirizzo personale ExecLingo. Il testo originale viene cancellato dopo 30 giorni.",
  });
  await sendEmail(to, `Risposta pronta: ${subject || "la tua mail"}`, html, `${answer.summaryIt}\n\n${answer.replyEn}`);
}

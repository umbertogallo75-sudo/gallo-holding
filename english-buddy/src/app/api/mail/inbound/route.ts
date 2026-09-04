import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { htmlToText, MAX_BODY_CHARS, parseInbound, receivedEmailId, recipientAlias, type Inbound } from "@/lib/mail/inbound";
import { answerMail } from "@/lib/mail/process";
import { attachAnswer, markFailed, saveIncoming, senderIsKnown, userForAlias } from "@/lib/mail/store";
import { renderEmail, sendEmail } from "@/lib/email";
import { readSignatureHeaders, verifySvixSignature } from "@/lib/mail/signature";

export const dynamic = "force-dynamic";

/**
 * Where a forwarded email lands.
 *
 * Called by the service that receives mail for the inbound subdomain. Three
 * rules shape everything here:
 *
 * It proves who is calling before it believes anything. This is a public URL
 * that writes into a user's account, so an unsigned request does nothing.
 *
 * It reads the raw bytes before parsing them, because that is what the
 * signature covers.
 *
 * And it almost never returns an error. A mail relay treats a failure as
 * "try again", so a message for an address that does not exist would be
 * redelivered for days; worse, a 404 for an unknown alias and a 200 for a
 * real one is an oracle for guessing addresses. Anything unrecognised is
 * accepted and dropped.
 */

/**
 * Two ways in, on purpose.
 *
 * The signature is how the mail service is recognised — an HMAC over the id,
 * the timestamp and the exact body, which also makes a captured delivery
 * unusable a few minutes later. The shared secret is for everything else: a
 * different provider, a relay of our own, a test from a terminal.
 */
function authorised(request: Request, rawBody: string): boolean {
  const signing = process.env.MAIL_INBOUND_SIGNING_SECRET?.trim();
  if (signing && verifySvixSignature(rawBody, readSignatureHeaders(request), signing)) return true;

  const expected = process.env.MAIL_INBOUND_SECRET?.trim();
  if (!expected) return false;
  const url = new URL(request.url);
  const given = (request.headers.get("x-execlingo-secret") || url.searchParams.get("key") || "").trim();
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/**
 * Fetches the message the mail service has already accepted for us.
 *
 * Resend's webhook carries only the envelope; the body is asked for
 * afterwards. That is not a limitation to work around — knowing the recipient
 * before downloading anything means a message for an address nobody owns
 * costs one lookup instead of a download.
 *
 * Called only once the alias is known to belong to somebody, so a stranger
 * cannot make the server fetch anything.
 */
async function fetchReceived(emailId: string, alias: string): Promise<Inbound | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    console.error("inbound fetch failed:", response.status, (await response.text()).slice(0, 200));
    return null;
  }
  const email = (await response.json()) as { from?: string; subject?: string; text?: string; html?: string };
  const parsed = parseInbound({
    to: `${alias}@inbound`,
    from: email.from ?? "",
    subject: email.subject ?? "",
    text: email.text ?? "",
  });
  if (!parsed) return null;
  // A message with no plain-text part arrives here with text as an empty
  // string rather than a missing key, which is not the case parseInbound
  // falls back on.
  if (!parsed.text && email.html) parsed.text = htmlToText(email.html).slice(0, MAX_BODY_CHARS);
  return parsed;
}

export async function POST(request: Request) {
  // Raw first: the signature covers these exact bytes, and re-serialising a
  // parsed object would produce different ones.
  const rawBody = await request.text();
  if (!authorised(request, rawBody)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: "unparseable" });
  }

  const client = db();
  const emailId = receivedEmailId(payload);
  // Two shapes: a service that posts the whole message, and one that posts the
  // envelope and holds the body until asked. Either way the alias comes first.
  const alias = emailId ? recipientAlias(payload) : (parseInbound(payload)?.toAlias ?? "");
  if (!alias) return NextResponse.json({ ok: true, ignored: "no recipient" });

  const userId = await userForAlias(alias, client);
  if (!userId) return NextResponse.json({ ok: true, ignored: "unknown" });

  const mail = emailId ? await fetchReceived(emailId, alias) : parseInbound(payload);
  if (!mail || !mail.text) return NextResponse.json({ ok: true, ignored: "empty" });

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

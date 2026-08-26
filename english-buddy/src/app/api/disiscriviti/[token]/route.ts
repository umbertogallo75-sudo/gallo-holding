import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSubscription } from "@/lib/marketing/prefs";
import { suppress, unsuppress } from "@/lib/marketing/suppression";
import { readEmailToken } from "@/lib/marketing/tokens";

/**
 * Unsubscribe, both ways it can arrive.
 *
 * POST is the one-click path: mail clients POST this URL themselves when they
 * show their own "unsubscribe" button, and the whole point is that it works
 * without the person logging in, or reading anything, or being asked why.
 *
 * GET exists because the same URL travels in the List-Unsubscribe header and
 * some clients simply open it — so it sends the reader to the page rather
 * than acting. A link scanner following it must never unsubscribe anybody.
 */
/** The address on the account, so the suppression list can be keyed by it. */
async function addressOf(userId: string): Promise<string | null> {
  try {
    const result = await db().execute({ sql: "SELECT email FROM auth_users WHERE id = ? LIMIT 1", args: [userId] });
    const email = result.rows[0]?.email;
    return email ? String(email) : null;
  } catch {
    return null;
  }
}

export async function POST(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const userId = readEmailToken(token, "unsub");
  if (!userId) return NextResponse.json({ error: "Link non valido" }, { status: 400 });
  await setSubscription(userId, false, "email-link");
  // Also by address, so the objection outlives the account it came from.
  const email = await addressOf(userId);
  if (email) await suppress(email, "unsubscribe");
  return NextResponse.json({ ok: true });
}

/** Undo, for the person who clicked by mistake and says so on the page. */
export async function DELETE(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const userId = readEmailToken(token, "unsub");
  if (!userId) return NextResponse.json({ error: "Link non valido" }, { status: 400 });
  await setSubscription(userId, true, "email-link-undo");
  const email = await addressOf(userId);
  if (email) await unsuppress(email);
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  return NextResponse.redirect(new URL(`/disiscriviti/${token}`, request.url));
}

import { NextResponse } from "next/server";
import { grantTrial } from "@/lib/marketing/trial";
import { readEmailToken } from "@/lib/marketing/tokens";

/**
 * Starts the free trial for the account the signed link names. No session
 * required: the link arrived at their own address, which is the proof.
 *
 * POST only, and deliberately so — the clock starts here, and a corporate
 * mail gateway pre-opening every link in the message would otherwise burn
 * somebody's 24 hours before they had read the email.
 */
export async function POST(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const userId = readEmailToken(token, "trial");
  if (!userId) return NextResponse.json({ error: "Link non valido" }, { status: 400 });
  const trial = await grantTrial(userId);
  if (!trial) return NextResponse.json({ error: "Riprova tra un minuto" }, { status: 503 });
  return NextResponse.json({ ok: true, endsAt: trial.endsAt.toISOString(), extended: trial.extended });
}

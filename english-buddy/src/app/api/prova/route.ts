import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { readTrial, grantTrial } from "@/lib/marketing/trial";

/**
 * Claiming the free trial from inside the app.
 *
 * The session is the whole gate: free access exists only for people who have
 * an account, because an anonymous trial is a stranger we can never write to
 * again — no welcome, no reminder, no reason to come back.
 *
 * This exists next to the emailed link because most people never open the
 * email. An offer that can only be found in an inbox is an offer most of the
 * audience never sees.
 */
export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // One trial per account, whichever door it is claimed through.
  const existing = await readTrial(userId);
  if (existing) {
    return NextResponse.json(
      { ok: false, already: true, active: existing.active, endsAt: existing.endsAt.toISOString() },
      { status: 409 }
    );
  }
  const trial = await grantTrial(userId);
  if (!trial) return NextResponse.json({ error: "Riprova tra un minuto" }, { status: 503 });
  return NextResponse.json({ ok: true, endsAt: trial.endsAt.toISOString() });
}

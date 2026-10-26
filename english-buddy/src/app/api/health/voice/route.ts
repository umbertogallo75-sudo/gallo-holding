import { NextResponse } from "next/server";
import { readVoiceHealth } from "@/lib/voice/health";

export const dynamic = "force-dynamic";

/**
 * Is the spoken conversation working? Yes or no, and nothing else.
 *
 * Open on purpose, so the morning check can read it without a credential —
 * and therefore carrying no numbers: not how many calls, not how many people,
 * not who. A verdict and a word for why. Everything behind it is on the admin
 * page, where there is a login.
 *
 * It exists because the pages lie about this one thing. On 26 October the
 * voice was dead and every page answered perfectly: the call screen opened,
 * the clock ran, the microphone light came on. Whether anybody could actually
 * talk to Sam was invisible from outside, and it was found by accident.
 */
export async function GET() {
  const health = await readVoiceHealth();
  return NextResponse.json(
    { ok: health.ok, reason: health.reason },
    { headers: { "Cache-Control": "no-store" } }
  );
}

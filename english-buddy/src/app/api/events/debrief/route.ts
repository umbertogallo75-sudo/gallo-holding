import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { billingEnforced, getEntitlement, PAYWALL_MESSAGE } from "@/lib/stripe";
import { ANDROID_PAYWALL_MESSAGE, EMBEDDED_PAYWALL_MESSAGE, embeddedShellOf } from "@/lib/appclient";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { debriefEvent } from "@/lib/ai/debrief";
import { getEvent, saveDebrief } from "@/lib/events";
import { ensureProfile, saveExpression } from "@/lib/learning/service";

export const maxDuration = 60;

const bodySchema = z.object({
  id: z.string().uuid(),
  howItWent: z.string().trim().min(3).max(600),
  missing: z.string().trim().max(600).optional(),
});

/**
 * The two minutes after the meeting. What they could not say becomes the
 * phrases they will have next time — and the review schedule picks them up
 * like any other, so nobody has to decide to study them.
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!rateLimit(clientKey(request, "debrief"), 10, 60_000).allowed) {
    return NextResponse.json({ error: "Troppe richieste: aspetta qualche secondo." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Raccontami com'è andata." }, { status: 400 });

  if (billingEnforced()) {
    const entitlement = await getEntitlement(userId);
    if (!entitlement.access) {
      const shell = embeddedShellOf(request);
      const message = shell === "android" ? ANDROID_PAYWALL_MESSAGE : shell === "ios" ? EMBEDDED_PAYWALL_MESSAGE : PAYWALL_MESSAGE;
      return NextResponse.json({ error: message, upgradeUrl: "/abbonamento" }, { status: 402 });
    }
  }

  const database = db();
  const event = await getEvent(userId, parsed.data.id, database);
  if (!event) return NextResponse.json({ error: "Appuntamento non trovato." }, { status: 404 });

  try {
    const debrief = await debriefEvent(event.title, parsed.data.howItWent, parsed.data.missing ?? null);
    await saveDebrief(userId, event.id, debrief, database);
    await ensureProfile(userId, database);
    for (const phrase of debrief.phrases) {
      await saveExpression(userId, phrase.english, phrase.italian, database).catch(() => undefined);
    }
    return NextResponse.json(debrief);
  } catch (error) {
    console.error("debrief failed:", error);
    return NextResponse.json({ error: "Non sono riuscito a elaborarlo: riprova fra un momento." }, { status: 502 });
  }
}

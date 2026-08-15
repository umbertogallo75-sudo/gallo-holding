import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { billingEnforced, getEntitlement, PAYWALL_MESSAGE } from "@/lib/stripe";
import { ANDROID_PAYWALL_MESSAGE, EMBEDDED_PAYWALL_MESSAGE, embeddedShellOf } from "@/lib/appclient";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { prepareForEvent } from "@/lib/ai/prep";
import { createEvent, deleteEvent } from "@/lib/events";
import { ensureProfile, saveExpression } from "@/lib/learning/service";

// Preparing a whole appointment is the longest model call in the app.
export const maxDuration = 60;

const bodySchema = z.object({
  title: z.string().trim().min(4).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
});

/** Creates an appointment and prepares the user for it. */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!rateLimit(clientKey(request, "events"), 10, 60_000).allowed) {
    return NextResponse.json({ error: "Troppe richieste: aspetta qualche secondo." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Scrivi di cosa si tratta e quando." }, { status: 400 });

  if (billingEnforced()) {
    const entitlement = await getEntitlement(userId);
    if (!entitlement.access) {
      const shell = embeddedShellOf(request);
      const message = shell === "android" ? ANDROID_PAYWALL_MESSAGE : shell === "ios" ? EMBEDDED_PAYWALL_MESSAGE : PAYWALL_MESSAGE;
      return NextResponse.json({ error: message, upgradeUrl: "/abbonamento" }, { status: 402 });
    }
  }

  const database = db();
  const profile = await database
    .execute({ sql: "SELECT professional_context FROM profiles WHERE id = ? LIMIT 1", args: [userId] })
    .catch(() => null);
  const context = profile?.rows[0]?.professional_context ? String(profile.rows[0].professional_context) : null;
  const state = await database
    .execute({ sql: "SELECT cefr_level FROM learning_state WHERE user_id = ? LIMIT 1", args: [userId] })
    .catch(() => null);
  const level = state?.rows[0]?.cefr_level ? String(state.rows[0].cefr_level) : null;

  try {
    const prep = await prepareForEvent(parsed.data.title, context, level);
    const id = await createEvent(userId, parsed.data.title, parsed.data.date, parsed.data.time ?? null, prep, database);
    // The phrases prepared for a real appointment are the best possible
    // review material, so they join the spaced repetition like any other.
    await ensureProfile(userId, database);
    for (const phrase of prep.phrases) {
      await saveExpression(userId, phrase.english, phrase.italian, database).catch(() => undefined);
    }
    return NextResponse.json({ id });
  } catch (error) {
    console.error("event prep failed:", error);
    return NextResponse.json({ error: "Non sono riuscito a preparare la scheda: riprova fra un momento." }, { status: 502 });
  }
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await deleteEvent(userId, parsed.data.id);
  return NextResponse.json({ ok: true });
}

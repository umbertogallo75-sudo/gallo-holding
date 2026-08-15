import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { billingEnforced, getEntitlement, PAYWALL_MESSAGE } from "@/lib/stripe";
import { ANDROID_PAYWALL_MESSAGE, EMBEDDED_PAYWALL_MESSAGE, embeddedShellOf } from "@/lib/appclient";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { findMissingPhrase } from "@/lib/ai/missing";
import { ensureProfile, saveExpression } from "@/lib/learning/service";

// The model call is the slow part; the platform default would cut it short.
export const maxDuration = 60;

const bodySchema = z.object({ italian: z.string().trim().min(2).max(400) });

/**
 * "La frase che mi è mancata". The user writes in Italian what they could not
 * say; they get the English back at once, and it is filed into the same
 * spaced repetition as everything else — so the gap they hit this morning
 * comes back as practice, without them having to do anything about it.
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!rateLimit(clientKey(request, "missing"), 20, 60_000).allowed) {
    return NextResponse.json({ error: "Troppe richieste: aspetta qualche secondo." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Scrivi cosa volevi dire." }, { status: 400 });

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

  try {
    const phrase = await findMissingPhrase(parsed.data.italian, context);
    // Saved before the reply leaves: the point of the feature is that the
    // phrase comes back on its own, not that it is read once.
    await ensureProfile(userId, database);
    await saveExpression(userId, phrase.english, phrase.italian, database).catch(() => undefined);
    return NextResponse.json(phrase);
  } catch (error) {
    console.error("missing phrase failed:", error);
    return NextResponse.json({ error: "Non sono riuscito a trovarla: riprova fra un momento." }, { status: 502 });
  }
}

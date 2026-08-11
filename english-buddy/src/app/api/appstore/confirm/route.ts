import { NextResponse } from "next/server";
import { z } from "zod";
import { appStoreConfigured, applyAppleTransaction, decodeJwsPayload, fetchTransaction, type AppleTransaction } from "@/lib/appstore";
import { getUserId } from "@/lib/auth";
import { trackEvent } from "@/lib/analytics";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  jws: z.string().min(20).max(10_000).optional(),
  transactionId: z.string().min(1).max(80).optional(),
});

/**
 * Called by the iOS app right after a StoreKit purchase. The client payload
 * is only used to learn the transactionId — the authoritative transaction is
 * fetched from Apple before touching billing.
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!appStoreConfigured()) return NextResponse.json({ error: "Acquisti in-app non configurati" }, { status: 503 });
  if (!rateLimit(clientKey(request, "appstore-confirm"), 20, 15 * 60_000).allowed) {
    return NextResponse.json({ error: "Troppi tentativi" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });

  const claimed = parsed.data.jws ? decodeJwsPayload<AppleTransaction>(parsed.data.jws) : null;
  const transactionId = parsed.data.transactionId ?? claimed?.transactionId;
  if (!transactionId) return NextResponse.json({ error: "Transazione mancante" }, { status: 400 });

  const tx = await fetchTransaction(String(transactionId));
  if (!tx) return NextResponse.json({ error: "Transazione non trovata da Apple" }, { status: 404 });

  const result = await applyAppleTransaction(tx, userId);
  if (!result.ok) return NextResponse.json({ error: `Acquisto non applicabile (${result.error})` }, { status: 400 });

  await trackEvent("purchase_apple", { userId, meta: { plan: result.plan } });
  return NextResponse.json({ ok: true, plan: result.plan });
}

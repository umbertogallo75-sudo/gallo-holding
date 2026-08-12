import { NextResponse } from "next/server";
import { z } from "zod";
import { acknowledgePurchase, applyGooglePurchase, fetchPurchase, playStoreConfigured, GOOGLE_PRODUCTS } from "@/lib/playstore";
import { getUserId } from "@/lib/auth";
import { trackEvent } from "@/lib/analytics";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  productId: z.string().min(1).max(80),
  purchaseToken: z.string().min(10).max(2_000),
});

/**
 * Called by the Android app right after a Play Billing purchase (Digital
 * Goods API). The client payload only names the token — the authoritative
 * purchase state is fetched from Google before touching billing, and the
 * purchase is acknowledged so Google does not auto-refund it.
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!playStoreConfigured()) return NextResponse.json({ error: "Acquisti in-app non configurati" }, { status: 503 });
  if (!rateLimit(clientKey(request, "playstore-confirm"), 20, 15 * 60_000).allowed) {
    return NextResponse.json({ error: "Troppi tentativi" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  if (!GOOGLE_PRODUCTS[parsed.data.productId]) return NextResponse.json({ error: "Prodotto sconosciuto" }, { status: 400 });

  const purchase = await fetchPurchase(parsed.data.purchaseToken, parsed.data.productId);
  if (!purchase) return NextResponse.json({ error: "Acquisto non trovato da Google" }, { status: 404 });
  if (!purchase.active) return NextResponse.json({ error: "Acquisto non attivo" }, { status: 400 });

  const result = await applyGooglePurchase(purchase, parsed.data.purchaseToken, userId);
  if (!result.ok) return NextResponse.json({ error: `Acquisto non applicabile (${result.error})` }, { status: 400 });

  await acknowledgePurchase(parsed.data.purchaseToken, purchase);
  await trackEvent("purchase_google", { userId, meta: { plan: result.plan } });
  return NextResponse.json({ ok: true, plan: result.plan });
}

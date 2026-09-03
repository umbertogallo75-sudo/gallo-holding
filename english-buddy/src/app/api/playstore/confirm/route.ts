import { NextResponse } from "next/server";
import { z } from "zod";
import { acknowledgePurchase, applyGooglePurchase, fetchPurchase, playObfuscatedAccountId, playStoreConfigured, GOOGLE_PRODUCTS } from "@/lib/playstore";
import { getUserId } from "@/lib/auth";
import { trackEventOnce } from "@/lib/analytics";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getBilling, maintenanceUnlocked } from "@/lib/stripe";

const bodySchema = z.object({
  productId: z.string().min(1).max(80),
  purchaseToken: z.string().min(10).max(2_000),
});

/**
 * Called by the Android app right after a Play Billing purchase (Digital
 * Goods API). The client payload only names the token — the authoritative
 * purchase state is fetched from Google before touching billing, and the
 * purchase is persisted before it is acknowledged, so a transient database
 * failure can never leave a charged customer without access.
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

  if (parsed.data.productId === "maintenance") {
    const billing = await getBilling(userId);
    if (!maintenanceUnlocked(billing)) {
      return NextResponse.json({ error: "Il mantenimento richiede prima il Programma 3 mesi" }, { status: 403 });
    }
  }

  const purchase = await fetchPurchase(parsed.data.purchaseToken, parsed.data.productId);
  if (!purchase) return NextResponse.json({ error: "Acquisto non trovato da Google" }, { status: 404 });
  if (purchase.productId !== parsed.data.productId) {
    return NextResponse.json({ error: "Il prodotto verificato non corrisponde alla richiesta" }, { status: 409 });
  }

  const expectedAccountId = playObfuscatedAccountId(userId);
  if (!expectedAccountId || !purchase.obfuscatedAccountId || purchase.obfuscatedAccountId !== expectedAccountId) {
    return NextResponse.json({ error: "L’acquisto non appartiene a questo account ExecLingo" }, { status: 409 });
  }

  const result = await applyGooglePurchase(purchase, parsed.data.purchaseToken, userId);
  if (!result.ok) return NextResponse.json({ error: `Acquisto non applicabile (${result.error})` }, { status: 400 });
  if (result.stale) {
    return NextResponse.json({ error: "Stato acquisto già aggiornato. Riprova il ripristino." }, { status: 409 });
  }
  // Persist the verified inactive state AFTER ownership checks so a restored
  // revoked token cannot keep granting access. Never acknowledge/count it.
  if (!purchase.active) return NextResponse.json({ error: "Acquisto non attivo" }, { status: 400 });

  const acknowledged = await acknowledgePurchase(parsed.data.purchaseToken, purchase);
  if (!acknowledged) {
    return NextResponse.json({
      error: "Piano registrato, ma conferma Google ancora in attesa. Tocca Ripristina acquisti per riprovare.",
      recorded: true,
      plan: result.plan,
    }, { status: 502 });
  }

  const tracked = await trackEventOnce(
    "purchase_google",
    `google:${parsed.data.purchaseToken}`,
    { userId, meta: { plan: result.plan } },
  );
  if (!tracked) {
    return NextResponse.json({
      error: "Piano registrato, ma registrazione della conversione ancora in attesa. Tocca Ripristina acquisti per riprovare.",
      recorded: true,
      trackingPending: true,
      plan: result.plan,
    }, { status: 502 });
  }
  return NextResponse.json({ ok: true, plan: result.plan });
}

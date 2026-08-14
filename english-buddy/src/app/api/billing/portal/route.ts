import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { createBillingPortal, getBilling, isStripeCustomer, stripeConfigured } from "@/lib/stripe";

/**
 * Opens Stripe's billing portal for the signed-in user: the one place where a
 * web subscriber can cancel, change card or fetch invoices. Only customers we
 * actually created on Stripe get through — a store subscription is cancelled
 * in the App Store or Play Store, never here.
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!stripeConfigured()) return NextResponse.json({ error: "Pagamenti non configurati" }, { status: 503 });

  const billing = await getBilling(userId);
  const customerId = isStripeCustomer(billing) ? billing!.stripeCustomerId! : null;
  if (!customerId) {
    return NextResponse.json({ error: "Nessun abbonamento con carta su questo account" }, { status: 404 });
  }

  const origin = process.env.APP_BASE_URL || new URL(request.url).origin;
  try {
    const url = await createBillingPortal(customerId, `${origin}/abbonamento`);
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: "Portale non raggiungibile: riprova." }, { status: 502 });
  }
}

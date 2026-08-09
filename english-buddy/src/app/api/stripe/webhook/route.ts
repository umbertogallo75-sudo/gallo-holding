import { NextResponse } from "next/server";
import { saveBilling, userIdByCustomer, verifyStripeSignature } from "@/lib/stripe";

export const maxDuration = 30;

type StripeObject = {
  client_reference_id?: string;
  metadata?: { userId?: string; plan?: string };
  customer?: string;
  mode?: string;
  status?: string;
  current_period_end?: number;
};

/** Keeps the billing table in sync with Stripe. Signature-verified. */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(payload) as { type: string; data?: { object?: StripeObject } };
  const object = event.data?.object ?? {};
  const customer = object.customer ? String(object.customer) : null;
  const metaUser = object.client_reference_id || object.metadata?.userId || null;

  if (event.type === "checkout.session.completed") {
    const userId = metaUser;
    const plan = object.metadata?.plan ?? null;
    if (userId) {
      // One-time program purchase: 3 months + a week of courtesy. Subscriptions
      // get their real period end from the subscription events that follow.
      const periodEnd = object.mode === "payment" ? new Date(Date.now() + 98 * 86_400_000).toISOString() : null;
      await saveBilling({ userId, stripeCustomerId: customer, plan, status: "active", currentPeriodEnd: periodEnd });
    }
  } else if (event.type.startsWith("customer.subscription.")) {
    const userId = metaUser || object.metadata?.userId || (customer ? await userIdByCustomer(customer) : null);
    if (userId) {
      const plan = object.metadata?.plan ?? null;
      const deleted = event.type === "customer.subscription.deleted";
      const active = object.status === "active" || object.status === "trialing";
      const periodEnd = object.current_period_end ? new Date(object.current_period_end * 1000).toISOString() : null;
      await saveBilling({
        userId,
        stripeCustomerId: customer,
        plan,
        status: deleted ? "canceled" : active ? "active" : String(object.status ?? "inactive"),
        currentPeriodEnd: periodEnd,
      });
    }
  } else if (event.type === "invoice.payment_failed" && customer) {
    const userId = await userIdByCustomer(customer);
    if (userId) await saveBilling({ userId, status: "past_due" });
  }

  return NextResponse.json({ received: true });
}

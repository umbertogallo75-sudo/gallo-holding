import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { createCheckout, stripeConfigured } from "@/lib/stripe";
import { trackEvent } from "@/lib/analytics";

const bodySchema = z.object({ plan: z.enum(["monthly", "program", "maintenance"]) });

/** Starts a Stripe Checkout session for the chosen plan. */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "I pagamenti non sono ancora attivi. Riprova più tardi." }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const emailResult = await db().execute({ sql: "SELECT email FROM auth_users WHERE id = ? LIMIT 1", args: [userId] });
    const email = emailResult.rows[0]?.email ? String(emailResult.rows[0].email) : null;
    const base = (process.env.APP_BASE_URL || "https://execlingo.it").replace(/\/$/, "");
    const url = await createCheckout(userId, email, parsed.data.plan, base);
    // Recorded on the server, where the Stripe session really was created —
    // not on the button, which fires whether or not anything came back.
    await trackEvent("checkout_started", { userId, meta: { plan: parsed.data.plan } });
    return NextResponse.json({ url });
  } catch (error) {
    console.error("checkout error:", error);
    const detail = error instanceof Error ? error.message.slice(0, 300) : undefined;
    // A payment that could not even be started is the most expensive failure
    // on the site and the one nothing was counting.
    await trackEvent("checkout_failed", { userId, meta: { plan: parsed.data.plan } }).catch(() => null);
    return NextResponse.json({ error: "Impossibile avviare il pagamento. Riprova tra qualche minuto.", detail }, { status: 500 });
  }
}

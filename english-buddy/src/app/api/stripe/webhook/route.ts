import { NextResponse } from "next/server";
import { generateLicenses } from "@/lib/licenses";
import { renderEmail, sendEmail } from "@/lib/email";
import { recordCommission, reverseCommission } from "@/lib/partners";
import { saveBilling, userIdByCustomer, verifyStripeSignature } from "@/lib/stripe";

export const maxDuration = 60;

type StripeObject = {
  id?: string;
  client_reference_id?: string;
  metadata?: { userId?: string; plan?: string; b2b?: string; company?: string; qty?: string };
  customer?: string;
  customer_email?: string;
  customer_details?: { email?: string };
  mode?: string;
  status?: string;
  current_period_end?: number;
  amount_total?: number;
  currency?: string;
  total_details?: { amount_tax?: number };
  payment_intent?: string;
};

/** A completed team order becomes license codes, emailed to the buyer. */
async function fulfillTeamOrder(object: StripeObject): Promise<void> {
  const quantity = Number(object.metadata?.qty ?? 0);
  const companyName = object.metadata?.company ?? "";
  const buyerEmail = object.customer_details?.email || object.customer_email || "";
  const orderId = String(object.id ?? "");
  if (!quantity || !orderId || !buyerEmail) return;

  const codes = await generateLicenses({ orderId, companyName, buyerEmail, quantity });
  const codeBlock = codes.map((c) => `<div style="font-family:ui-monospace,Menlo,monospace;font-size:15px;padding:7px 12px;background:#f2f4ef;border-radius:8px;margin:4px 0;letter-spacing:.06em;">${c}</div>`).join("");
  await sendEmail(
    buyerEmail,
    `Le tue ${quantity} licenze ExecLingo sono pronte`,
    renderEmail({
      preheader: `${quantity} codici licenza per il team di ${companyName || "la tua azienda"} — pronti da distribuire.`,
      heading: `Benvenuti a bordo${companyName ? `, ${companyName}` : ""}!`,
      bodyHtml: `<p style="margin:0 0 12px;font-size:15.5px;line-height:1.6;color:#3a423b;">Il pagamento è andato a buon fine. Qui sotto trovi <strong>${quantity} codici licenza</strong>, uno per ogni persona del team. Ogni codice attiva il <strong>Programma 3 mesi</strong> completo.</p>
        <p style="margin:0 0 8px;font-size:14.5px;line-height:1.6;color:#3a423b;"><strong>Come attivarle</strong> — inoltra a ogni collega queste 3 righe insieme al suo codice:</p>
        <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#6b736a;">1. Vai su <a href="https://www.execlingo.it/register" style="color:#2f8f63;">execlingo.it/register</a> e crea il tuo accesso<br>2. Apri <strong>Profilo → 💳 Abbonamento e piani</strong><br>3. Inserisci il codice licenza nella casella &ldquo;Codice aziendale&rdquo; — e inizia con Sam</p>
        ${codeBlock}
        <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#8a917f;">Conserva questa email: è l&rsquo;elenco delle tue licenze. Per fatturazione o assistenza: ug@vaspitalia.com</p>`,
      footerNote: "Hai ricevuto questa email perché hai acquistato licenze team su execlingo.it.",
    }),
    `Pagamento ricevuto: ${quantity} licenze ExecLingo per ${companyName}.\n\nCodici:\n${codes.join("\n")}\n\nOgni collega: 1) registrazione su https://www.execlingo.it/register 2) Profilo -> Abbonamento 3) inserire il codice.\n\nAssistenza: ug@vaspitalia.com`
  );
  // Heads-up to the owner so no corporate order goes unnoticed.
  await sendEmail(
    "ug@vaspitalia.com",
    `🏢 Nuovo ordine team: ${quantity} licenze — ${companyName}`,
    renderEmail({
      preheader: `${companyName} ha acquistato ${quantity} licenze.`,
      heading: "Nuovo ordine aziendale",
      bodyHtml: `<p style="margin:0;font-size:15px;line-height:1.7;color:#3a423b;">Azienda: <strong>${companyName}</strong><br>Referente: ${buyerEmail}<br>Licenze: <strong>${quantity}</strong><br>Ordine Stripe: ${orderId}</p>`,
      footerNote: "Notifica automatica ordini team.",
    })
  );
}

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

  if (event.type === "checkout.session.completed" && object.metadata?.b2b === "1") {
    await fulfillTeamOrder(object);
  } else if (event.type === "checkout.session.completed") {
    const userId = metaUser;
    const plan = object.metadata?.plan ?? null;
    if (userId) {
      // One-time program purchase: 3 months + a week of courtesy. Subscriptions
      // get their real period end from the subscription events that follow.
      const periodEnd = object.mode === "payment" ? new Date(Date.now() + 98 * 86_400_000).toISOString() : null;
      await saveBilling({ userId, stripeCustomerId: customer, plan, status: "active", currentPeriodEnd: periodEnd });
      // Partner commission: idempotent on the session id, net of VAT, ≤5%.
      if (object.amount_total) {
        await recordCommission({
          userId,
          paymentRef: String(object.id ?? ""),
          paymentIntent: object.payment_intent ? String(object.payment_intent) : null,
          plan,
          grossCents: Number(object.amount_total),
          taxCents: object.total_details?.amount_tax ?? null,
          currency: object.currency ?? "eur",
        }).catch((error) => console.error("commission error:", error));
      }
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
  } else if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    // Refund/chargeback: reverse any pending or held partner commission.
    const intent = object.payment_intent ? String(object.payment_intent) : null;
    if (intent) await reverseCommission(intent, event.type).catch(() => {});
  }

  return NextResponse.json({ received: true });
}

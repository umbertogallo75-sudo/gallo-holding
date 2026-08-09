import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { MAX_TEAM_SEATS, MIN_TEAM_SEATS, teamUnitAmount } from "@/lib/licenses";
import { createTeamCheckout, stripeConfigured } from "@/lib/stripe";

const bodySchema = z.object({
  companyName: z.string().trim().min(2).max(200),
  email: z.string().trim().toLowerCase().email().max(160),
  quantity: z.number().int().min(MIN_TEAM_SEATS).max(MAX_TEAM_SEATS),
});

/** Public self-service team purchase — no account needed to buy seats. */
export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "company-checkout"), 10, 60 * 60_000).allowed) {
    return NextResponse.json({ error: "Troppi tentativi. Riprova più tardi." }, { status: 429 });
  }
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "I pagamenti non sono ancora attivi. Scrivici a ug@vaspitalia.com" }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Controlla i dati inseriti" }, { status: 400 });
  const { companyName, email, quantity } = parsed.data;

  const unitAmount = teamUnitAmount(quantity);
  if (!unitAmount) return NextResponse.json({ error: `Minimo ${MIN_TEAM_SEATS} licenze` }, { status: 400 });

  try {
    const base = (process.env.APP_BASE_URL || "https://execlingo.it").replace(/\/$/, "");
    const url = await createTeamCheckout({ companyName, buyerEmail: email, quantity, unitAmount }, base);
    return NextResponse.json({ url });
  } catch (error) {
    console.error("company checkout error:", error);
    return NextResponse.json({ error: "Impossibile avviare il pagamento. Riprova tra qualche minuto." }, { status: 500 });
  }
}

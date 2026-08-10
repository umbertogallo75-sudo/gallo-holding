import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createPartner, PARTNER_TYPES } from "@/lib/partners";

const bodySchema = z.object({
  country: z.string().trim().min(2).max(60),
  partnerType: z.enum(PARTNER_TYPES),
  acceptTerms: z.literal(true),
});

/** Self-service partner activation: logged-in user → ACTIVE partner, no approval. */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(clientKey(request, "partner-join"), 5, 60 * 60_000).allowed) {
    return NextResponse.json({ error: "Troppi tentativi. Riprova più tardi." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Compila tutti i campi e accetta i termini" }, { status: 400 });

  const user = await db().execute({ sql: "SELECT display_name, email FROM auth_users WHERE id = ? LIMIT 1", args: [userId] });
  const name = user.rows[0]?.display_name ? String(user.rows[0].display_name) : "Partner";
  const email = user.rows[0]?.email ? String(user.rows[0].email) : null;

  const partner = await createPartner({ userId, name, email, country: parsed.data.country, partnerType: parsed.data.partnerType });
  return NextResponse.json({ ok: true, refCode: partner.refCode, rate: partner.commissionRate });
}

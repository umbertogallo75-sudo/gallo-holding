import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getPartner, LEAD_PROTECTION_DAYS, audit } from "@/lib/partners";

const bodySchema = z.object({
  contactName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(160).optional(),
  source: z.enum(["MEETING", "PHONE", "EMAIL", "WHATSAPP", "NETWORKING", "REFERRAL", "OTHER"]),
  notes: z.string().trim().max(600).optional(),
});

/** Offline commercial leads: sales agents register contacts they are working. */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(clientKey(request, "partner-lead"), 30, 60 * 60_000).allowed) {
    return NextResponse.json({ error: "Troppi tentativi. Riprova più tardi." }, { status: 429 });
  }
  const partner = await getPartner(userId);
  if (!partner || partner.status !== "ACTIVE") return NextResponse.json({ error: "Non sei un partner attivo" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Controlla i dati del contatto" }, { status: 400 });
  const data = parsed.data;

  // Lead protection only for genuine commercial partner types.
  const protectedTypes = ["SALES_AGENT", "CONSULTANT", "CORPORATE_PARTNER", "INTERNAL_SALES"];
  const protectedUntil = protectedTypes.includes(partner.partnerType)
    ? new Date(Date.now() + LEAD_PROTECTION_DAYS * 86_400_000).toISOString()
    : new Date(Date.now() + 30 * 86_400_000).toISOString();

  await db().execute({
    sql: `INSERT INTO partner_leads (id, partner_id, contact_name, email, phone, company, source, notes, protected_until)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [randomUUID(), userId, data.contactName, data.email || null, data.phone || null, data.company || null, data.source, data.notes || null, protectedUntil],
  });
  await audit(userId, "lead_registered", null, `${data.contactName} (${data.source})`);
  return NextResponse.json({ ok: true });
}

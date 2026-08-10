import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit, getPartner } from "@/lib/partners";

const bodySchema = z.object({
  method: z.enum(["BANK_TRANSFER", "PAYPAL", "OTHER"]),
  details: z.string().trim().min(5).max(600),
});

/** Payout profile: required before any money moves (sales stay possible without it). */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partner = await getPartner(userId);
  if (!partner) return NextResponse.json({ error: "Non sei un partner" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Inserisci metodo e coordinate complete" }, { status: 400 });

  await db().execute({
    sql: "UPDATE partners SET payout_method = ?, payout_details = ?, payout_docs_status = 'complete' WHERE user_id = ?",
    args: [parsed.data.method, parsed.data.details, userId],
  });
  await audit(userId, "payout_profile_completed", userId, parsed.data.method);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { redeemLicense } from "@/lib/licenses";

const bodySchema = z.object({ code: z.string().trim().min(6).max(40) });

/** Redeems a team license code and activates the 3-month program. */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(clientKey(request, "redeem"), 10, 60 * 60_000).allowed) {
    return NextResponse.json({ error: "Troppi tentativi. Riprova più tardi." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Codice non valido" }, { status: 400 });

  const result = await redeemLicense(parsed.data.code, userId);
  if (!result.ok) {
    const message = result.reason === "already_used" ? "Questo codice è già stato utilizzato." : "Codice non trovato: controlla di averlo copiato per intero.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, companyName: result.companyName });
}

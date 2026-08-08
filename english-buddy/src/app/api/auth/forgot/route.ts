import { NextResponse } from "next/server";
import { z } from "zod";
import { createResetToken } from "@/lib/auth-users";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email().max(160) });

/**
 * Access-code recovery. Response is intentionally generic (never reveals
 * whether an email is registered). When no email provider is configured the
 * client is told to use the admin-mediated fallback instead.
 */
export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "forgot"), 5, 60 * 60_000).allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  if (!isEmailConfigured()) return NextResponse.json({ ok: true, emailConfigured: false });

  const reset = await createResetToken(parsed.data.email);
  if (reset) {
    const base = process.env.APP_BASE_URL || "https://english-buddy-hxvi.vercel.app";
    const link = `${base}/reset?token=${reset.token}`;
    await sendEmail(
      parsed.data.email,
      "English Buddy — recupera il tuo codice di accesso",
      `<p>Ciao ${reset.name || ""},</p>
       <p>hai chiesto di reimpostare il tuo codice di accesso a <strong>English Buddy</strong>.</p>
       <p><a href="${link}" style="display:inline-block;background:#1d6b4c;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:bold">Scegli un nuovo codice</a></p>
       <p>Il link vale 30 minuti. Se non sei stato tu, ignora questa email: il tuo codice resta invariato.</p>
       <p>— English Buddy</p>`
    );
  }
  return NextResponse.json({ ok: true, emailConfigured: true });
}

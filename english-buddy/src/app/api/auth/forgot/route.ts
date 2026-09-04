import { NextResponse } from "next/server";
import { z } from "zod";
import { createResetToken } from "@/lib/auth-users";
import { isEmailConfigured, renderEmail, sendEmail } from "@/lib/email";
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
    // Prefer the explicit base URL, else the domain the user is actually on,
    // so reset links follow the app onto execlingo.it automatically.
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const base = process.env.APP_BASE_URL || (host ? `https://${host}` : "https://www.execlingo.it");
    const link = `${base}/reset?token=${reset.token}`;
    const firstName = reset.name ? ` ${reset.name}` : "";
    await sendEmail(
      parsed.data.email,
      "Recupera il tuo codice di accesso a ExecLingo",
      renderEmail({
        preheader: "Scegli un nuovo codice in un minuto — il link vale 30 minuti.",
        heading: `Ciao${firstName}, recuperiamo il tuo accesso.`,
        bodyHtml: `<p style="margin:0 0 12px;font-size:15.5px;line-height:1.6;color:#3a423b;">Hai chiesto di reimpostare il tuo codice personale di accesso a <strong>ExecLingo</strong>. Tocca il pulsante qui sotto e scegline uno nuovo: ci vuole un minuto.</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#6b736a;">⏱ Il link vale <strong>30 minuti</strong> e funziona una sola volta.<br>🔒 Se non sei stato tu, ignora questa email: il tuo codice resta invariato e il tuo account è al sicuro.</p>`,
        ctaLabel: "Scegli un nuovo codice",
        ctaUrl: link,
        footerNote: "Hai ricevuto questa email perché è stato richiesto il recupero del codice per il tuo account ExecLingo.",
      }),
      `Ciao${firstName},\n\nhai chiesto di reimpostare il tuo codice di accesso a ExecLingo.\n\nApri questo link per sceglierne uno nuovo (vale 30 minuti, una sola volta):\n${link}\n\nSe non sei stato tu, ignora questa email: il tuo codice resta invariato.\n\nExecLingo · un servizio VASP ITALIA SRL\nhttps://www.execlingo.it`
    );
  }
  return NextResponse.json({ ok: true, emailConfigured: true });
}

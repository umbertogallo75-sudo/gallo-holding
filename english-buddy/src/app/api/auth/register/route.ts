import { NextResponse } from "next/server";
import { z } from "zod";
import { safeEqual, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { createAuthUser } from "@/lib/auth-users";
import { isEmailConfigured, renderEmail, sendEmail } from "@/lib/email";
import { trackEvent } from "@/lib/analytics";
import { attributeSignup } from "@/lib/partners";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(160),
  code: z.string().min(8, "La password deve avere almeno 8 caratteri").max(200),
  inviteCode: z.string().max(200).optional(),
  refCode: z.string().trim().max(40).optional(),
});

export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "register"), 10, 60 * 60_000).allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const { name, email, code, inviteCode } = parsed.data;

  // Registration is open by default. Setting INVITE_CODE on the server locks
  // it down to invitees without any code change.
  const invite = process.env.INVITE_CODE;
  if (invite && (!inviteCode || !safeEqual(inviteCode, invite))) {
    return NextResponse.json({ error: "An invite code is required to register." }, { status: 403 });
  }

  const userId = await createAuthUser(name, code, email);
  await trackEvent("register_done", { userId });

  // Welcome email: the legal bridge between the store apps (no purchases
  // shown, per Apple rules) and the web, where plans are bought. Must never
  // break a registration.
  if (isEmailConfigured()) {
    try {
      const base = (process.env.APP_BASE_URL || "https://www.execlingo.it").replace(/\/$/, "");
      await sendEmail(
        email,
        "Benvenuto in ExecLingo — ecco come iniziare",
        renderEmail({
          preheader: "Il test del livello è gratis. E quando vuoi tutto Sam, ecco come si sblocca.",
          heading: `Benvenuto, ${name}!`,
          bodyHtml: `<p style="margin:0 0 12px;font-size:15.5px;line-height:1.6;color:#3a423b;">Il tuo account <strong>ExecLingo</strong> è pronto. Da dove iniziare:</p>
            <p style="margin:0 0 12px;font-size:15.5px;line-height:1.6;color:#3a423b;">🧭 <strong>Fai subito il test del livello</strong> — 3 minuti di chiacchierata con Sam, gratis, senza voti. Da lì parte il tuo percorso.</p>
            <p style="margin:0 0 12px;font-size:15.5px;line-height:1.6;color:#3a423b;">🔓 <strong>Per allenarti ogni giorno</strong> — chat e voce con Sam, missioni business, Meeting Warm-up, English Rescue — attiva il piano che preferisci dal sito. Prezzi IVA inclusa, si disdice quando si vuole.</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#6b736a;">🏢 La tua azienda ti ha dato un <strong>codice</strong>? Inseriscilo in Profilo → Abbonamento e sei operativo.<br>📲 Vuoi ExecLingo sul telefono? <a href="${base}/scarica" style="color:#2f8f63;">Installala in 10 secondi</a>.</p>`,
          ctaLabel: "Scopri i piani e sblocca Sam",
          ctaUrl: `${base}/abbonamento`,
          footerNote: "Hai ricevuto questa email perché ti sei appena registrato a ExecLingo.",
        }),
        `Benvenuto, ${name}!\n\nIl tuo account ExecLingo è pronto.\n\n1) Fai il test del livello: 3 minuti con Sam, gratis, senza voti.\n2) Per allenarti ogni giorno, attiva un piano: ${base}/abbonamento (prezzi IVA inclusa).\n3) Hai un codice aziendale? Inseriscilo in Profilo → Abbonamento.\n\nApp sul telefono: ${base}/scarica\n\nExecLingo · un servizio VASP ITALIA SRL\nhttps://execlingo.it`
      );
    } catch {
      // Email problems must never block a registration.
    }
  }

  // Referral attribution: cookie set by /r/CODE, manual code, or offline lead.
  try {
    let refCode: string | null = parsed.data.refCode ?? null;
    let campaign: string | null = null;
    const cookie = request.headers.get("cookie")?.match(/eb_ref=([^;]+)/)?.[1];
    if (!refCode && cookie) {
      const decoded = JSON.parse(decodeURIComponent(cookie)) as { c?: string; k?: string };
      refCode = decoded.c ?? null;
      campaign = decoded.k ?? null;
    }
    await attributeSignup({ userId, email, refCode, campaign });
  } catch {
    // Attribution must never break a registration.
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { safeEqual, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { createAuthUser } from "@/lib/auth-users";
import { sendMarketing, onceKey } from "@/lib/marketing/send";
import { welcomeTrial } from "@/lib/marketing/templates";
import { trackEvent } from "@/lib/analytics";
import { parseAttributionCookie, saveAttribution } from "@/lib/attribution";
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

  // The visitor id is what joins the anonymous half of the funnel to the named
  // half: without it the landing views and the accounts are two separate piles
  // of numbers that can never be reconciled. The source is frozen on the user
  // now because the payment arrives later over a webhook, with no browser.
  const attribution = parseAttributionCookie(request.headers.get("cookie"));
  await trackEvent("register_done", {
    userId,
    visitorId: attribution?.visitorId ?? null,
    meta: attribution ? { src: attribution.source, medium: attribution.medium, campaign: attribution.campaign } : undefined,
  });
  await saveAttribution(userId, attribution);

  // Welcome email. It carries the free-trial offer, so it is marketing as
  // well as a greeting and goes through the marketing door like everything
  // else: claimed once, and carrying a way out. Must never break a signup.
  try {
    await sendMarketing({
      userId,
      email,
      kind: "welcome_trial",
      claimKey: onceKey(userId, "welcome_trial"),
      message: welcomeTrial(userId, name),
    });
  } catch {
    // Email problems must never block a registration.
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

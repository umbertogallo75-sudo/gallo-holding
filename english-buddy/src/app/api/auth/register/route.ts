import { NextResponse } from "next/server";
import { z } from "zod";
import { safeEqual, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { accessCodeInUse, createAuthUser } from "@/lib/auth-users";
import { trackEvent } from "@/lib/analytics";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(160),
  code: z.string().min(8, "The personal code must be at least 8 characters").max(200),
  inviteCode: z.string().max(200).optional(),
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

  if (await accessCodeInUse(code)) {
    return NextResponse.json({ error: "This personal code is already taken — choose a different one." }, { status: 409 });
  }

  const userId = await createAuthUser(name, code, email);
  await trackEvent("register_done", { userId });

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

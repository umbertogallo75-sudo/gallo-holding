import { NextResponse } from "next/server";
import { z } from "zod";
import { safeEqual, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { accessCodeInUse, createAuthUser } from "@/lib/auth-users";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  inviteCode: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(80),
  code: z.string().min(8, "The personal code must be at least 8 characters").max(200),
});

export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "register"), 5, 60 * 60_000).allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const invite = process.env.INVITE_CODE;
  if (!invite) {
    return NextResponse.json({ error: "Registration is not enabled." }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const { inviteCode, name, code } = parsed.data;

  if (!safeEqual(inviteCode, invite)) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 403 });
  }
  if (await accessCodeInUse(code)) {
    return NextResponse.json({ error: "This personal code is already taken — choose a different one." }, { status: 409 });
  }

  const userId = await createAuthUser(name, code);

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

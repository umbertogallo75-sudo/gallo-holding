import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { resetCodeWithToken } from "@/lib/auth-users";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  token: z.string().min(20).max(120),
  code: z.string().min(8, "The new code must be at least 8 characters").max(200),
});

/** Completes an email reset: valid token → new access code + fresh session. */
export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "reset"), 10, 60 * 60_000).allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const userId = await resetCodeWithToken(parsed.data.token, parsed.data.code);
  if (!userId) {
    return NextResponse.json({ error: "Link scaduto o codice già in uso — richiedi un nuovo link o scegli un altro codice." }, { status: 400 });
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

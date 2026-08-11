import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { findUserIdByAccessCode, findUserIdByEmailPassword } from "@/lib/auth-users";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * Standard login: email + password. The legacy body shape ({ code }) from
 * cached clients keeps working through the unique-code lookup.
 */
const bodySchema = z.object({
  email: z.string().trim().max(160).optional(),
  password: z.string().min(1).max(200).optional(),
  code: z.string().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "login"), 10, 15 * 60_000).allowed) {
    return NextResponse.json({ error: "Troppi tentativi: riprova tra qualche minuto." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Email e password sono obbligatorie." }, { status: 400 });
  const { email, password, code } = parsed.data;

  let userId: string | null = null;
  if (email && password) {
    userId = await findUserIdByEmailPassword(email, password);
  } else if (code) {
    userId = await findUserIdByAccessCode(code);
  } else {
    return NextResponse.json({ error: "Email e password sono obbligatorie." }, { status: 400 });
  }

  if (!userId) return NextResponse.json({ error: "Email o password non corretti." }, { status: 401 });

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

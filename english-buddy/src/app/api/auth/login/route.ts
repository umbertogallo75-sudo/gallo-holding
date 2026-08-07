import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, safeEqual, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({ code: z.string().min(1).max(200) });

export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "login"), 10, 15 * 60_000).allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Access code required" }, { status: 400 });

  const expected = process.env.APP_ACCESS_CODE;
  if (!expected) return NextResponse.json({ error: "Server is not configured" }, { status: 500 });
  if (!safeEqual(parsed.data.code, expected)) {
    return NextResponse.json({ error: "Incorrect access code" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

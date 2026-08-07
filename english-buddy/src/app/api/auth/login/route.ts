import { NextResponse } from "next/server";
import { expectedSessionToken, SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  const { code } = await request.json();
  const expected = process.env.APP_ACCESS_CODE;
  if (!expected) return NextResponse.json({ error: "APP_ACCESS_CODE is missing" }, { status: 500 });
  if (typeof code !== "string" || code !== expected) return NextResponse.json({ error: "Incorrect access code" }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, expectedSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return response;
}

import { NextResponse } from "next/server";
import { baseUrl, googleAuthUrl, googleEnabled } from "@/lib/oauth";

/** Entry point: redirects to Google's consent screen. */
export async function GET() {
  if (!googleEnabled()) return NextResponse.redirect(new URL("/login", baseUrl()));
  return NextResponse.redirect(googleAuthUrl());
}

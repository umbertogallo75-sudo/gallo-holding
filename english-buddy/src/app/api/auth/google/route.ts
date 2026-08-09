import { NextResponse } from "next/server";
import { googleAuthUrl, googleEnabled } from "@/lib/oauth";

/** Entry point: redirects to Google's consent screen. */
export async function GET() {
  if (!googleEnabled()) return NextResponse.redirect(new URL("/login", process.env.APP_BASE_URL || "https://execlingo.it"));
  return NextResponse.redirect(googleAuthUrl());
}

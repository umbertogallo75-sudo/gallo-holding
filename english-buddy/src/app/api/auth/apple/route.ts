import { NextResponse } from "next/server";
import { appleAuthUrl, appleEnabled } from "@/lib/oauth";

/** Entry point: redirects to Apple's sign-in screen. */
export async function GET() {
  if (!appleEnabled()) return NextResponse.redirect(new URL("/login", process.env.APP_BASE_URL || "https://execlingo.it"));
  return NextResponse.redirect(appleAuthUrl());
}

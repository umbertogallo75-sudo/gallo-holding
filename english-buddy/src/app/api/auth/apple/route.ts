import { NextResponse } from "next/server";
import { appleAuthUrl, appleEnabled, baseUrl } from "@/lib/oauth";

/** Entry point: redirects to Apple's sign-in screen. */
export async function GET() {
  if (!appleEnabled()) return NextResponse.redirect(new URL("/login", baseUrl()));
  return NextResponse.redirect(appleAuthUrl());
}

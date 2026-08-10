import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/forgot") ||
    path.startsWith("/reset") ||
    path === "/privacy" ||
    path === "/termini" ||
    path === "/aziende" ||
    path === "/partner" ||
    path === "/scarica" ||
    path === "/app" ||
    path.startsWith("/r/") ||
    path.startsWith("/.well-known/") ||
    path === "/api/billing/company-checkout" ||
    path.startsWith("/api/auth") ||
    path.startsWith("/api/cron") ||
    path === "/api/track" ||
    path === "/api/stripe/webhook" ||
    path.startsWith("/icons/") ||
    path === "/manifest.webmanifest" ||
    path === "/sw.js" ||
    path === "/apple-touch-icon.png" ||
    path.startsWith("/banners/") ||
    path.startsWith("/marketing/");

  // Presence check only — cryptographic validation happens server-side in lib/auth.
  if (!isPublic && !request.cookies.get("english_buddy_session")) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

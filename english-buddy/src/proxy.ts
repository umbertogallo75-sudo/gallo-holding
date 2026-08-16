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
    path === "/cookie" ||
    path === "/termini" ||
    path === "/elimina-account" ||
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
    // Answered before signing in, by definition: the whole point is that the
    // question comes first.
    path === "/api/consent" ||
    path === "/api/stripe/webhook" ||
    path === "/api/appstore/notifications" ||
    path.startsWith("/icons/") ||
    path === "/manifest.webmanifest" ||
    path === "/sw.js" ||
    path === "/apple-touch-icon.png" ||
    path.startsWith("/banners/") ||
    path.startsWith("/marketing/");

  // Presence check only — cryptographic validation happens server-side in lib/auth.
  let response: NextResponse;
  if (!isPublic && !request.cookies.get("english_buddy_session")) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    response = NextResponse.redirect(url);
  } else {
    response = NextResponse.next();
  }

  // The Android TWA launches on /home?app=twa: pin the reader-mode cookie so
  // every later navigation (without the query) still counts as embedded.
  if (request.nextUrl.searchParams.get("app") === "twa") {
    response.cookies.set("eb_app", "twa", { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/" });
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

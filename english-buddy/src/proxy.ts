import { NextResponse, type NextRequest } from "next/server";

const INDEXABLE_PAGES = new Set([
  "/",
  "/inglese-lavoro",
  "/scarica",
  "/offerte",
  "/aziende",
  "/partner",
  "/privacy",
  "/cookie",
  "/termini",
  "/elimina-account",
]);

const PROTECTED_PAGE_PREFIXES = [
  "/home",
  "/mail",
  "/onboarding",
  "/phrasebook",
  "/riunione",
  "/prepara",
  "/buddy",
  "/profile",
  "/voice",
  "/abbonamento",
  "/piano",
  "/admin",
  "/allenamenti",
  "/progress",
  "/rescue",
  "/partner/dashboard",
];

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/forgot") ||
    path.startsWith("/reset") ||
    path === "/robots.txt" ||
    path === "/sitemap.xml" ||
    path === "/privacy" ||
    path === "/cookie" ||
    path === "/termini" ||
    path === "/elimina-account" ||
    path === "/aziende" ||
    path === "/partner" ||
    path === "/scarica" ||
    path === "/offerte" ||
    path === "/inglese-lavoro" ||
    path === "/app" ||
    path.startsWith("/r/") ||
    // From an email, so there is no session yet by definition.
    path.startsWith("/disiscriviti/") ||
    path.startsWith("/prova/") ||
    path.startsWith("/api/disiscriviti/") ||
    path.startsWith("/api/prova/") ||
    path.startsWith("/.well-known/") ||
    path === "/api/billing/company-checkout" ||
    path.startsWith("/api/auth") ||
    path.startsWith("/api/cron") ||
    path === "/api/track" ||
    // Answered before signing in, by definition: the whole point is that the
    // question comes first.
    path === "/api/consent" ||
    path === "/api/stripe/webhook" ||
    // Inbound mail arrives from a relay with no session, only the shared
    // secret the route itself checks. Everything under /mail stays private.
    path === "/api/mail/inbound" ||
    path === "/api/appstore/notifications" ||
    path.startsWith("/icons/") ||
    path === "/manifest.webmanifest" ||
    path === "/sw.js" ||
    path === "/apple-touch-icon.png" ||
    path.startsWith("/banners/") ||
    path.startsWith("/marketing/") ||
    path.startsWith("/store-badges/");

  // Presence check only — cryptographic validation happens server-side in lib/auth.
  let response: NextResponse;
  if (!isPublic && !request.cookies.get("english_buddy_session")) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (PROTECTED_PAGE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      response = NextResponse.redirect(url);
    } else {
      // Unknown URLs are not authentication entry points. Returning a real
      // 404 prevents arbitrary paths from masquerading as credential pages.
      return new NextResponse("Pagina non trovata", {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }
  } else {
    response = NextResponse.next();
  }

  if (INDEXABLE_PAGES.has(path)) {
    const canonical = new URL(path, "https://www.execlingo.it").toString();
    response.headers.set("Link", `<${canonical}>; rel=\"canonical\"`);
  } else if (!path.startsWith("/_next/")) {
    response.headers.set("X-Robots-Tag", "noindex, follow");
  }

  // The Android TWA launches on /home?app=twa: pin the reader-mode cookie so
  // every later navigation (without the query) still counts as embedded.
  if (request.nextUrl.searchParams.get("app") === "twa") {
    response.cookies.set("eb_app", "twa", { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/" });
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"] };

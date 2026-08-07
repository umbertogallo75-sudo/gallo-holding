import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/api/auth") ||
    path.startsWith("/icons/") ||
    path === "/manifest.webmanifest" ||
    path === "/sw.js" ||
    path === "/apple-touch-icon.png";

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

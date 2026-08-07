import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = path === "/" || path.startsWith("/login") || path.startsWith("/api/auth") || path.startsWith("/icons/") || path === "/manifest.webmanifest" || path === "/sw.js";
  if (!isPublic && !request.cookies.get("english_buddy_session")) {
    const url = request.nextUrl.clone(); url.pathname = "/login"; return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

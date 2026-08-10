import { NextResponse } from "next/server";

/**
 * Smart download link for QR codes and campaigns: /app sends each device to
 * its store once the store URLs are configured, otherwise to the download
 * page with the browser-install instructions.
 */
export function GET(request: Request) {
  const ua = request.headers.get("user-agent") ?? "";
  const appStore = process.env.APP_STORE_URL;
  const playStore = process.env.PLAY_STORE_URL;

  if (/android/i.test(ua) && playStore) return NextResponse.redirect(playStore, 302);
  if (/iphone|ipad|ipod/i.test(ua) && appStore) return NextResponse.redirect(appStore, 302);

  const base = (process.env.APP_BASE_URL || "https://www.execlingo.it").replace(/\/$/, "");
  return NextResponse.redirect(`${base}/scarica`, 302);
}

import { NextResponse } from "next/server";
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from "@/lib/attribution";
import {
  configuredAppStoreUrl,
  configuredPlayStoreUrl,
  playStoreCampaignUrl,
  redirectAttributionRecord,
  safeMarketingSearch,
} from "@/lib/store-links";

const ATTRIBUTION_MAX_AGE = 90 * 24 * 60 * 60;

function redirectWithAttribution(request: Request, destination: string, search: URLSearchParams) {
  const response = NextResponse.redirect(destination, 302);
  if (!parseAttributionCookie(request.headers.get("cookie"))) {
    const record = redirectAttributionRecord(search, request.headers.get("referer"));
    if (record) {
      // NextResponse serializes the cookie value; passing pre-encoded JSON
      // would encode the percent signs a second time and make the shared
      // parser treat the record as corrupt.
      response.cookies.set(ATTRIBUTION_COOKIE, JSON.stringify(record), {
        maxAge: ATTRIBUTION_MAX_AGE,
        path: "/",
        sameSite: "lax",
        secure: new URL(request.url).protocol === "https:",
      });
    }
  }
  return response;
}

/**
 * Smart download link for QR codes and campaigns: /app sends each device to
 * its store once the store URLs are configured, otherwise to the download
 * page with the browser-install instructions.
 */
export function GET(request: Request) {
  const ua = request.headers.get("user-agent") ?? "";
  const incoming = new URL(request.url);
  const appStore = configuredAppStoreUrl();
  const playStore = configuredPlayStoreUrl();

  if (/android/i.test(ua) && playStore) {
    const destination = playStoreCampaignUrl(playStore, incoming.searchParams) ?? playStore;
    return redirectWithAttribution(request, destination, incoming.searchParams);
  }
  if (/iphone|ipad|ipod/i.test(ua) && appStore) {
    return redirectWithAttribution(request, appStore, incoming.searchParams);
  }

  const base = (process.env.APP_BASE_URL || "https://www.execlingo.it").replace(/\/$/, "");
  const fallback = new URL("/scarica", base);
  // If a store is not live yet, keep the campaign parameters all the way to
  // the tracked download page instead of turning paid traffic into "direct".
  fallback.search = safeMarketingSearch(incoming.searchParams).toString();
  return redirectWithAttribution(request, fallback.href, incoming.searchParams);
}

import { NextResponse } from "next/server";
import { trackEvent } from "@/lib/analytics";
import { parseAttributionCookie, saveAttribution } from "@/lib/attribution";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { baseUrl, decodeIdToken, findOrCreateOAuthUser, googleEnabled, validClaims, verifyOauthState } from "@/lib/oauth";

export const maxDuration = 30;

function loginRedirect(reason: string) {
  const url = new URL("/login", baseUrl());
  url.searchParams.set("oauth_error", reason);
  return NextResponse.redirect(url);
}

/**
 * A signup through a provider is still a signup: it has to enter the funnel,
 * carry its acquisition source and be reported to the ad platform exactly
 * like one made with an email and a password. Until now none of the three
 * happened, so every customer arriving through Google or Apple was invisible
 * to the measurement the whole plan rests on.
 */
async function recordSignup(request: Request, userId: string): Promise<void> {
  const attribution = parseAttributionCookie(request.headers.get("cookie"));
  await trackEvent("register_done", {
    userId,
    visitorId: attribution?.visitorId ?? null,
    meta: attribution ? { src: attribution.source, medium: attribution.medium, campaign: attribution.campaign } : undefined,
  });
  await saveAttribution(userId, attribution);
}

export async function GET(request: Request) {
  if (!googleEnabled()) return loginRedirect("not-configured");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code || !verifyOauthState(url.searchParams.get("state"))) return loginRedirect("state");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: `${baseUrl()}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) return loginRedirect("exchange");
  const tokens = (await tokenResponse.json()) as { id_token?: string };
  const claims = decodeIdToken(tokens.id_token ?? "");
  if (!validClaims(claims, process.env.GOOGLE_CLIENT_ID ?? "", ["https://accounts.google.com", "accounts.google.com"])) {
    return loginRedirect("claims");
  }

  const { userId, created } = await findOrCreateOAuthUser("google", claims.sub, claims.email?.toLowerCase() ?? null, claims.name ?? null);
  if (created) await recordSignup(request, userId).catch((error) => console.error("signup tracking failed:", error));
  const response = NextResponse.redirect(new URL(created ? "/?signup=1" : "/", baseUrl()));
  response.cookies.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

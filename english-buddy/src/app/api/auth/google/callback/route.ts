import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { baseUrl, decodeIdToken, findOrCreateOAuthUser, googleEnabled, validClaims, verifyOauthState } from "@/lib/oauth";

export const maxDuration = 30;

function loginRedirect(reason: string) {
  const url = new URL("/login", baseUrl());
  url.searchParams.set("oauth_error", reason);
  return NextResponse.redirect(url);
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

  const userId = await findOrCreateOAuthUser("google", claims.sub, claims.email?.toLowerCase() ?? null, claims.name ?? null);
  const response = NextResponse.redirect(new URL("/", baseUrl()));
  response.cookies.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

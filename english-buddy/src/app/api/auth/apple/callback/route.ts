import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { appleClientSecret, appleEnabled, baseUrl, decodeIdToken, findOrCreateOAuthUser, validClaims, verifyOauthState } from "@/lib/oauth";

export const maxDuration = 30;

function loginRedirect(reason: string) {
  const url = new URL("/login", baseUrl());
  url.searchParams.set("oauth_error", reason);
  return NextResponse.redirect(url, 303);
}

/** Apple posts the result back (response_mode=form_post). */
export async function POST(request: Request) {
  if (!appleEnabled()) return loginRedirect("not-configured");
  const form = await request.formData().catch(() => null);
  const code = form?.get("code")?.toString();
  const state = form?.get("state")?.toString() ?? null;
  if (!code || !verifyOauthState(state)) return loginRedirect("state");

  const tokenResponse = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.APPLE_CLIENT_ID ?? "",
      client_secret: appleClientSecret(),
      redirect_uri: `${baseUrl()}/api/auth/apple/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) return loginRedirect("exchange");
  const tokens = (await tokenResponse.json()) as { id_token?: string };
  const claims = decodeIdToken(tokens.id_token ?? "");
  if (!validClaims(claims, process.env.APPLE_CLIENT_ID ?? "", ["https://appleid.apple.com"])) {
    return loginRedirect("claims");
  }

  // Apple sends the user's name only on the very first authorization.
  let name: string | null = null;
  try {
    const userField = form?.get("user")?.toString();
    if (userField) {
      const parsed = JSON.parse(userField) as { name?: { firstName?: string; lastName?: string } };
      name = [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean).join(" ") || null;
    }
  } catch { /* optional field */ }

  const userId = await findOrCreateOAuthUser("apple", claims.sub, claims.email?.toLowerCase() ?? null, name);
  const response = NextResponse.redirect(new URL("/", baseUrl()), 303);
  response.cookies.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export async function GET() {
  return loginRedirect("method");
}

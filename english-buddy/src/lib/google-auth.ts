import { createPrivateKey, createSign } from "node:crypto";

/**
 * OAuth2 access tokens for Google APIs via the service-account JWT bearer
 * flow. One service account (PLAY_SERVICE_ACCOUNT_*) covers both Play
 * purchases and Firebase Cloud Messaging — the scope decides which.
 */

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function serviceAccountConfigured(): boolean {
  return Boolean(process.env.PLAY_SERVICE_ACCOUNT_EMAIL && process.env.PLAY_SERVICE_ACCOUNT_KEY);
}

function privateKeyPem(): string {
  return (process.env.PLAY_SERVICE_ACCOUNT_KEY ?? "").trim().replace(/\\n/g, "\n");
}

/** Tokens live 15 minutes; cache per scope and reuse for 45 of those. */
const cache = new Map<string, { token: string; issuedAt: number }>();

export async function googleAccessToken(scope: string, now: number = Date.now()): Promise<string | null> {
  if (!serviceAccountConfigured()) return null;
  const hit = cache.get(scope);
  if (hit && now - hit.issuedAt < 45 * 60_000 * 0.6) return hit.token;

  const header = { alg: "RS256", typ: "JWT" };
  const iat = Math.floor(now / 1000) - 30;
  const payload = {
    iss: process.env.PLAY_SERVICE_ACCOUNT_EMAIL,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 15 * 60,
  };
  const signingInput = `${b64url(Buffer.from(JSON.stringify(header)))}.${b64url(Buffer.from(JSON.stringify(payload)))}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  const assertion = `${signingInput}.${b64url(signer.sign(createPrivateKey(privateKeyPem())))}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as { access_token?: string } | null;
  if (!data?.access_token) return null;
  cache.set(scope, { token: data.access_token, issuedAt: now });
  return data.access_token;
}

export const SCOPE_ANDROID_PUBLISHER = "https://www.googleapis.com/auth/androidpublisher";
export const SCOPE_FIREBASE_MESSAGING = "https://www.googleapis.com/auth/firebase.messaging";

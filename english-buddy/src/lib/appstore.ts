import { createPrivateKey, createSign, X509Certificate, createPublicKey, verify as cryptoVerify } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { saveBilling, userIdByCustomer } from "@/lib/stripe";

/**
 * Apple In-App Purchases: server-side confirmation and App Store Server
 * Notifications. Purchases land in the same billing table as Stripe — for
 * entitlement purposes an Apple subscriber and a Stripe subscriber are
 * identical. The billing "customer id" for Apple rows is
 * `apple:<originalTransactionId>`, which lets renewal notifications map
 * back to the user through the existing lookup.
 *
 * Env (from App Store Connect → Users and Access → Integrations → In-App
 * Purchase keys): APPSTORE_ISSUER_ID, APPSTORE_KEY_ID, APPSTORE_PRIVATE_KEY.
 */

export const APP_BUNDLE_ID = process.env.APPSTORE_BUNDLE_ID || "it.execlingo.app";

/** productId → plan of the existing billing model. */
export const APPLE_PRODUCTS: Record<string, { plan: "monthly" | "program" | "maintenance"; kind: "auto-renewable" | "non-renewing" }> = {
  "it.execlingo.app.monthly": { plan: "monthly", kind: "auto-renewable" },
  "it.execlingo.app.maintenance": { plan: "maintenance", kind: "auto-renewable" },
  "it.execlingo.app.program": { plan: "program", kind: "non-renewing" },
};

/** The program grants 3 months + a week of courtesy, like license redemption. */
export const PROGRAM_DAYS = 98;

export function appStoreConfigured(): boolean {
  return Boolean(process.env.APPSTORE_ISSUER_ID && process.env.APPSTORE_KEY_ID && process.env.APPSTORE_PRIVATE_KEY);
}

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function privateKeyPem(): string {
  const raw = (process.env.APPSTORE_PRIVATE_KEY ?? "").trim();
  if (raw.includes("BEGIN")) return raw.replace(/\\n/g, "\n");
  const body = raw.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}

/** Short-lived ES256 JWT for the App Store Server API. */
export function appStoreServerToken(now: number = Date.now()): string {
  const header = { alg: "ES256", kid: process.env.APPSTORE_KEY_ID, typ: "JWT" };
  const payload = {
    iss: process.env.APPSTORE_ISSUER_ID,
    iat: Math.floor(now / 1000) - 30,
    exp: Math.floor(now / 1000) + 15 * 60,
    aud: "appstoreconnect-v1",
    bid: APP_BUNDLE_ID,
  };
  const signingInput = `${b64url(Buffer.from(JSON.stringify(header)))}.${b64url(Buffer.from(JSON.stringify(payload)))}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  const signature = signer.sign({ key: createPrivateKey(privateKeyPem()), dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${b64url(signature)}`;
}

/** Decodes a JWS payload without verifying (verification happens elsewhere). */
export function decodeJwsPayload<T = Record<string, unknown>>(jws: string): T | null {
  const parts = jws.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export type AppleTransaction = {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  bundleId?: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
  type?: string;
  environment?: string;
};

/**
 * Fetches the authoritative transaction from Apple (production first, then
 * sandbox — the standard dance for review builds). The response arrives over
 * TLS from Apple, so its payload is trusted without local JWS verification.
 */
export async function fetchTransaction(transactionId: string): Promise<AppleTransaction | null> {
  const token = appStoreServerToken();
  for (const host of ["https://api.storekit.itunes.apple.com", "https://api.storekit-sandbox.itunes.apple.com"]) {
    const response = await fetch(`${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) continue; // sandbox transaction queried on prod, or vice versa
    if (response.status === 404) continue;
    if (!response.ok) return null;
    const data = (await response.json().catch(() => null)) as { signedTransactionInfo?: string } | null;
    if (!data?.signedTransactionInfo) return null;
    return decodeJwsPayload<AppleTransaction>(data.signedTransactionInfo);
  }
  return null;
}

/** Period end for a transaction: Apple's expiry, or purchase+98d for the program. */
export function periodEndFor(tx: AppleTransaction): string | null {
  if (tx.expiresDate) return new Date(tx.expiresDate).toISOString();
  const product = tx.productId ? APPLE_PRODUCTS[tx.productId] : undefined;
  if (product?.kind === "non-renewing" && tx.purchaseDate) {
    return new Date(tx.purchaseDate + PROGRAM_DAYS * 86_400_000).toISOString();
  }
  return null;
}

/** Applies a verified Apple transaction to the billing table. */
export async function applyAppleTransaction(
  tx: AppleTransaction,
  knownUserId: string | null,
  client: Client = db()
): Promise<{ ok: boolean; plan?: string; error?: string }> {
  if (tx.bundleId && tx.bundleId !== APP_BUNDLE_ID) return { ok: false, error: "bundle" };
  const product = tx.productId ? APPLE_PRODUCTS[tx.productId] : undefined;
  if (!product) return { ok: false, error: "product" };
  const customerKey = `apple:${tx.originalTransactionId ?? tx.transactionId}`;
  const userId = knownUserId ?? (await userIdByCustomer(customerKey, client));
  if (!userId) return { ok: false, error: "user" };

  const revoked = Boolean(tx.revocationDate);
  await saveBilling(
    {
      userId,
      stripeCustomerId: customerKey,
      plan: product.plan,
      status: revoked ? "canceled" : "active",
      currentPeriodEnd: revoked ? new Date().toISOString() : periodEndFor(tx),
    },
    client
  );
  return { ok: true, plan: product.plan };
}

// ---------- App Store Server Notifications V2 ----------

/** Apple Root CA - G3 (https://www.apple.com/certificateauthority/). */
const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

/**
 * Verifies an App Store Server Notification: the x5c chain must terminate at
 * Apple's root CA and the leaf must have signed the JWS. Returns the decoded
 * payload on success, null otherwise.
 */
export function verifyNotification<T = Record<string, unknown>>(signedPayload: string): T | null {
  try {
    const [headerB64, payloadB64, signatureB64] = signedPayload.split(".");
    if (!headerB64 || !payloadB64 || !signatureB64) return null;
    const header = JSON.parse(Buffer.from(headerB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { alg?: string; x5c?: string[] };
    if (header.alg !== "ES256" || !header.x5c || header.x5c.length < 2) return null;

    const certs = header.x5c.map((c) => new X509Certificate(Buffer.from(c, "base64")));
    const root = new X509Certificate(APPLE_ROOT_CA_G3_PEM);

    // Chain: each cert signed by the next; last signed by (or equal to) Apple's root.
    for (let i = 0; i < certs.length - 1; i++) {
      if (!certs[i].verify(certs[i + 1].publicKey)) return null;
    }
    const last = certs[certs.length - 1];
    const anchoredOnRoot = last.raw.equals(root.raw) || last.verify(root.publicKey);
    if (!anchoredOnRoot) return null;
    const now = Date.now();
    for (const cert of certs) {
      if (now < Date.parse(cert.validFrom) || now > Date.parse(cert.validTo)) return null;
    }

    // Leaf signature over header.payload (ES256, JOSE encoding).
    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature = Buffer.from(signatureB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const ok = cryptoVerify("sha256", signingInput, { key: createPublicKey(certs[0].publicKey), dsaEncoding: "ieee-p1363" }, signature);
    if (!ok) return null;

    return JSON.parse(Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export type AppleNotification = {
  notificationType?: string;
  subtype?: string;
  data?: {
    bundleId?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
};

/** Notification types that end access immediately. */
const REVOKING_TYPES = new Set(["REFUND", "REVOKE"]);
/** Notification types that mark the subscription as ended. */
const EXPIRING_TYPES = new Set(["EXPIRED", "GRACE_PERIOD_EXPIRED"]);

export async function handleNotification(payload: AppleNotification, client: Client = db()): Promise<{ handled: boolean; type?: string }> {
  const type = payload.notificationType ?? "";
  const signedTx = payload.data?.signedTransactionInfo;
  if (!signedTx) return { handled: false, type };
  const tx = decodeJwsPayload<AppleTransaction>(signedTx);
  if (!tx) return { handled: false, type };
  if (payload.data?.bundleId && payload.data.bundleId !== APP_BUNDLE_ID) return { handled: false, type };

  const customerKey = `apple:${tx.originalTransactionId ?? tx.transactionId}`;
  const userId = await userIdByCustomer(customerKey, client);
  if (!userId) return { handled: false, type };

  if (REVOKING_TYPES.has(type)) {
    await saveBilling({ userId, plan: null, status: "canceled", currentPeriodEnd: new Date().toISOString() }, client);
    return { handled: true, type };
  }
  if (EXPIRING_TYPES.has(type)) {
    await saveBilling({ userId, status: "canceled" }, client);
    return { handled: true, type };
  }
  // Renewals, resubscribes, plan changes, billing recovery: refresh the row.
  const result = await applyAppleTransaction(tx, userId, client);
  return { handled: result.ok, type };
}

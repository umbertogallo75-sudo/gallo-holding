import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { googleAccessToken, SCOPE_ANDROID_PUBLISHER, serviceAccountConfigured } from "@/lib/google-auth";
import { saveBilling, userIdByCustomer } from "@/lib/stripe";

/**
 * Google Play Billing: server-side verification of purchases made through
 * the Android app (TWA + Digital Goods API). Mirrors appstore.ts — verified
 * purchases land in the same billing table as Stripe and Apple, with the
 * customer key `google:<purchaseToken>` so later lookups (renewal refresh,
 * restore) map back to the user.
 *
 * Env (Google Cloud service account invited to the Play Console with
 * "Visualizza dati finanziari" + "Gestisci ordini"): PLAY_SERVICE_ACCOUNT_EMAIL,
 * PLAY_SERVICE_ACCOUNT_KEY (the private_key field of the JSON, PKCS8 PEM).
 */

export const PLAY_PACKAGE_NAME = process.env.PLAY_PACKAGE_NAME || "it.execlingo.app";

/** productId (Play Console) → plan of the existing billing model. */
export const GOOGLE_PRODUCTS: Record<string, { plan: "monthly" | "program" | "maintenance"; kind: "subscription" | "one-time" }> = {
  monthly: { plan: "monthly", kind: "subscription" },
  maintenance: { plan: "maintenance", kind: "subscription" },
  program: { plan: "program", kind: "one-time" },
};

/** Same courtesy window as Apple/licenses: 3 months + a week. */
export const PROGRAM_DAYS = 98;

export function playStoreConfigured(): boolean {
  return serviceAccountConfigured();
}

/** OAuth2 access token for the Play Developer API. */
export function playAccessToken(now: number = Date.now()): Promise<string | null> {
  return googleAccessToken(SCOPE_ANDROID_PUBLISHER, now);
}

const API_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

export type GooglePurchase = {
  productId: string;
  /** Milliseconds since epoch. */
  purchaseTimeMillis?: number;
  /** For subscriptions: when access ends. */
  expiryTimeMillis?: number;
  /** True when the purchase currently grants access. */
  active: boolean;
  /** True when Google still expects an acknowledgement. */
  needsAck: boolean;
  /** Subscription id needed by the v1 acknowledge endpoint. */
  subscriptionId?: string;
};

/** Fetches and normalizes a one-time product purchase. */
async function fetchProductPurchase(token: string, productId: string, accessToken: string): Promise<GooglePurchase | null> {
  const url = `${API_BASE}/${PLAY_PACKAGE_NAME}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as {
    purchaseState?: number; purchaseTimeMillis?: string; acknowledgementState?: number;
  } | null;
  if (!data) return null;
  return {
    productId,
    purchaseTimeMillis: data.purchaseTimeMillis ? Number(data.purchaseTimeMillis) : undefined,
    active: data.purchaseState === 0,
    needsAck: data.acknowledgementState === 0,
  };
}

/** Fetches and normalizes a subscription purchase (v2 endpoint). */
async function fetchSubscriptionPurchase(token: string, accessToken: string): Promise<GooglePurchase | null> {
  const url = `${API_BASE}/${PLAY_PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as {
    subscriptionState?: string;
    acknowledgementState?: string;
    lineItems?: { productId?: string; expiryTime?: string }[];
  } | null;
  const line = data?.lineItems?.[0];
  if (!data || !line?.productId) return null;
  const ACTIVE_STATES = new Set(["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"]);
  const expiry = line.expiryTime ? Date.parse(line.expiryTime) : undefined;
  const stillRunning = expiry !== undefined && expiry > Date.now();
  return {
    productId: line.productId,
    expiryTimeMillis: expiry,
    active: Boolean(data.subscriptionState && ACTIVE_STATES.has(data.subscriptionState) && stillRunning),
    needsAck: data.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING",
    subscriptionId: line.productId,
  };
}

/** Fetches the authoritative purchase state from Google for a token. */
export async function fetchPurchase(token: string, productId: string): Promise<GooglePurchase | null> {
  const accessToken = await playAccessToken();
  if (!accessToken) return null;
  const product = GOOGLE_PRODUCTS[productId];
  if (!product) return null;
  return product.kind === "one-time"
    ? fetchProductPurchase(token, productId, accessToken)
    : fetchSubscriptionPurchase(token, accessToken);
}

/** Acknowledges a purchase so Google does not refund it after three days. */
export async function acknowledgePurchase(token: string, purchase: GooglePurchase): Promise<boolean> {
  if (!purchase.needsAck) return true;
  const accessToken = await playAccessToken();
  if (!accessToken) return false;
  const product = GOOGLE_PRODUCTS[purchase.productId];
  const url = product?.kind === "one-time"
    ? `${API_BASE}/${PLAY_PACKAGE_NAME}/purchases/products/${encodeURIComponent(purchase.productId)}/tokens/${encodeURIComponent(token)}:acknowledge`
    : `${API_BASE}/${PLAY_PACKAGE_NAME}/purchases/subscriptions/${encodeURIComponent(purchase.subscriptionId ?? purchase.productId)}/tokens/${encodeURIComponent(token)}:acknowledge`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: "{}",
  });
  return response.ok;
}

/** Period end: Google's expiry for subscriptions, purchase+98d for the program. */
export function periodEndFor(purchase: GooglePurchase): string | null {
  if (purchase.expiryTimeMillis) return new Date(purchase.expiryTimeMillis).toISOString();
  const product = GOOGLE_PRODUCTS[purchase.productId];
  if (product?.kind === "one-time") {
    const start = purchase.purchaseTimeMillis ?? Date.now();
    return new Date(start + PROGRAM_DAYS * 86_400_000).toISOString();
  }
  return null;
}

/** Applies a verified Google purchase to the billing table. */
export async function applyGooglePurchase(
  purchase: GooglePurchase,
  token: string,
  knownUserId: string | null,
  client: Client = db()
): Promise<{ ok: boolean; plan?: string; error?: string }> {
  const product = GOOGLE_PRODUCTS[purchase.productId];
  if (!product) return { ok: false, error: "product" };
  const customerKey = `google:${token}`;
  const userId = knownUserId ?? (await userIdByCustomer(customerKey, client));
  if (!userId) return { ok: false, error: "user" };

  await saveBilling(
    {
      userId,
      stripeCustomerId: customerKey,
      plan: product.plan,
      status: purchase.active ? "active" : "canceled",
      currentPeriodEnd: purchase.active ? periodEndFor(purchase) : new Date().toISOString(),
    },
    client
  );
  return { ok: true, plan: product.plan };
}

/**
 * Refreshes Google subscriptions that are at (or past) their stored period
 * end: renewals push the expiry forward, lapsed ones flip to canceled. Runs
 * from the hourly cron; cheap because it only touches rows near expiry.
 */
export async function refreshGoogleSubscriptions(client: Client = db(), now: Date = new Date()): Promise<{ refreshed: number; lapsed: number }> {
  if (!playStoreConfigured()) return { refreshed: 0, lapsed: 0 };
  const soon = new Date(now.getTime() + 12 * 3600_000).toISOString();
  const rows = await client.execute({
    sql: "SELECT user_id, stripe_customer_id FROM billing WHERE stripe_customer_id LIKE 'google:%' AND status = 'active' AND plan IN ('monthly','maintenance') AND current_period_end IS NOT NULL AND current_period_end <= ? LIMIT 25",
    args: [soon],
  });
  let refreshed = 0, lapsed = 0;
  for (const row of rows.rows) {
    const token = String(row.stripe_customer_id).slice("google:".length);
    const accessToken = await playAccessToken();
    if (!accessToken) break;
    const purchase = await fetchSubscriptionPurchase(token, accessToken);
    if (!purchase) continue;
    const result = await applyGooglePurchase(purchase, token, String(row.user_id), client);
    if (!result.ok) continue;
    if (purchase.active) refreshed++; else lapsed++;
  }
  return { refreshed, lapsed };
}

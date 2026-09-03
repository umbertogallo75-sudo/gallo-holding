import { createHash, createHmac } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { googleAccessToken, SCOPE_ANDROID_PUBLISHER, serviceAccountConfigured } from "@/lib/google-auth";
import { ensureBillingSchema, userIdByCustomer } from "@/lib/stripe";
import { claimStorePurchaseWithStatus, ensureStorePurchaseSchema, storePurchaseOwner } from "@/lib/store-purchases";
import { GOOGLE_ENTITLEMENT_SCHEMA, googleEntitlementState } from "@/lib/google-entitlements";

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
export const GOOGLE_PRODUCTS: Record<string, { plan: "monthly" | "annual" | "program" | "maintenance"; kind: "subscription" | "one-time" }> = {
  monthly: { plan: "monthly", kind: "subscription" },
  annual: { plan: "annual", kind: "subscription" },
  maintenance: { plan: "maintenance", kind: "subscription" },
  program: { plan: "program", kind: "one-time" },
};

/** Same courtesy window as Apple/licenses: 3 months + a week. */
export const PROGRAM_DAYS = 98;

export function playStoreConfigured(): boolean {
  return serviceAccountConfigured();
}

/**
 * Opaque, stable account hint sent only to the trusted Android shell. It uses
 * its own long-lived key: rotating login sessions must never detach somebody
 * from a purchase already registered by Google Play.
 */
export function playAccountHint(userId: string, secret: string | undefined = process.env.PLAY_ACCOUNT_BINDING_SECRET): string | null {
  const stableSecret = secret?.trim();
  if (!stableSecret || stableSecret.length < 32) return null;
  return createHmac("sha256", stableSecret).update(`play-account:${userId}`).digest("hex");
}

/** Exact value written to Google Play by the native Android bridge. */
export function playObfuscatedAccountId(userId: string, secret?: string): string | null {
  const hint = playAccountHint(userId, secret);
  return hint ? createHash("sha256").update(`${PLAY_PACKAGE_NAME}:${hint}`).digest("hex") : null;
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
  /** Non-PII account binding supplied by the native billing client. */
  obfuscatedAccountId?: string;
  /** Captured BEFORE the Google request, to reject late stale responses. */
  verificationStartedAt?: number;
};

/** Fetches and normalizes a one-time product purchase. */
async function fetchProductPurchase(token: string, productId: string, accessToken: string): Promise<GooglePurchase | null> {
  const verificationStartedAt = Date.now();
  const url = `${API_BASE}/${PLAY_PACKAGE_NAME}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as {
    purchaseState?: number; purchaseTimeMillis?: string; acknowledgementState?: number; obfuscatedExternalAccountId?: string;
  } | null;
  if (!data) return null;
  return {
    productId,
    purchaseTimeMillis: data.purchaseTimeMillis ? Number(data.purchaseTimeMillis) : undefined,
    active: data.purchaseState === 0,
    needsAck: data.acknowledgementState === 0,
    obfuscatedAccountId: data.obfuscatedExternalAccountId,
    verificationStartedAt,
  };
}

/** Fetches and normalizes a subscription purchase (v2 endpoint). */
async function fetchSubscriptionPurchase(token: string, accessToken: string): Promise<GooglePurchase | null> {
  const verificationStartedAt = Date.now();
  const url = `${API_BASE}/${PLAY_PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as {
    subscriptionState?: string;
    acknowledgementState?: string;
    lineItems?: { productId?: string; expiryTime?: string }[];
    externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
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
    obfuscatedAccountId: data.externalAccountIdentifiers?.obfuscatedExternalAccountId,
    verificationStartedAt,
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
  const product = GOOGLE_PRODUCTS[purchase.productId];
  const end = product?.kind === "one-time"
    ? (purchase.purchaseTimeMillis === undefined ? NaN : purchase.purchaseTimeMillis + PROGRAM_DAYS * 86_400_000)
    : purchase.expiryTimeMillis;
  if (end === undefined || !Number.isFinite(end) || end <= 0) return null;
  const date = new Date(end);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Applies a verified Google purchase to the billing table. */
export async function applyGooglePurchase(
  purchase: GooglePurchase,
  token: string,
  knownUserId: string | null,
  client: Client = db()
): Promise<{ ok: boolean; plan?: string; error?: string; newlyRecorded?: boolean; stale?: boolean }> {
  const product = GOOGLE_PRODUCTS[purchase.productId];
  if (!product) return { ok: false, error: "product" };
  const periodEnd = periodEndFor(purchase);
  if (purchase.active && !periodEnd) return { ok: false, error: "expiry" };
  const verifiedAt = purchase.verificationStartedAt ?? Date.now();
  if (!Number.isSafeInteger(verifiedAt) || verifiedAt < 0) return { ok: false, error: "verification" };
  // DDL is prepared outside the write transaction. No network requests to
  // Google are made while holding the database lock.
  await ensureBillingSchema(client);
  await ensureStorePurchaseSchema(client);
  await client.executeMultiple(GOOGLE_ENTITLEMENT_SCHEMA);
  const customerKey = `google:${token}`;
  const tx = await client.transaction("write");
  try {
    const existingOwner = await storePurchaseOwner("google", token, tx)
      ?? await userIdByCustomer(customerKey, tx);
    if (knownUserId && existingOwner && knownUserId !== existingOwner) return { ok: false, error: "owner" };
    const userId = knownUserId ?? existingOwner;
    if (!userId) return { ok: false, error: "user" };
    const claim = await claimStorePurchaseWithStatus("google", token, userId, purchase.productId, tx);
    if (!claim.ok) return { ok: false, error: "owner" };

    const current = (await tx.execute({ sql: "SELECT * FROM billing WHERE user_id = ?", args: [userId] })).rows[0];
    // Preserve the one known legacy Google state before projecting another
    // token. INSERT OR IGNORE can never resurrect a tracked revoked purchase.
    const previousKey = String(current?.stripe_customer_id ?? "");
    const previousPlan = String(current?.plan ?? "");
    if (previousKey.startsWith("google:") && GOOGLE_PRODUCTS[previousPlan]
      && Number.isFinite(Date.parse(String(current?.current_period_end ?? "")))) {
      const previousToken = previousKey.slice("google:".length);
      const previousClaim = await claimStorePurchaseWithStatus("google", previousToken, userId, previousPlan, tx);
      if (!previousClaim.ok) return { ok: false, error: "owner" };
      await tx.execute({
        sql: `INSERT OR IGNORE INTO google_purchase_entitlements
              (purchase_key, user_id, product_id, plan, status, current_period_end, verified_at)
              VALUES (?, ?, ?, ?, ?, ?, 0)`,
        args: [previousToken, userId, previousPlan, previousPlan,
          current.status === "active" ? "active" : "canceled", String(current.current_period_end)],
      });
    }

    const stored = await tx.execute({
      sql: `INSERT INTO google_purchase_entitlements
              (purchase_key, user_id, product_id, plan, status, current_period_end, verified_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(purchase_key) DO UPDATE SET
              product_id = excluded.product_id, plan = excluded.plan,
              status = excluded.status, current_period_end = excluded.current_period_end,
              verified_at = excluded.verified_at, updated_at = CURRENT_TIMESTAMP
            WHERE google_purchase_entitlements.user_id = excluded.user_id
              AND (excluded.verified_at > google_purchase_entitlements.verified_at
                OR (excluded.verified_at = google_purchase_entitlements.verified_at
                  AND (google_purchase_entitlements.status <> 'canceled' OR excluded.status = 'canceled')))`,
      args: [token, userId, purchase.productId, product.plan, purchase.active ? "active" : "canceled", periodEnd, verifiedAt],
    });
    if (!stored.rowsAffected) {
      await tx.rollback();
      return { ok: true, plan: product.plan, newlyRecorded: false, stale: true };
    }
    const { best } = await googleEntitlementState(userId, previousKey, tx);
    // Never destroy Stripe/Apple customer routing or an administrator's free
    // grant. getEntitlement unions that independent state with this ledger.
    if (!current || (previousKey.startsWith("google:") && current.plan !== "free")) {
      await tx.execute({
        sql: `INSERT INTO billing (user_id, stripe_customer_id, plan, status, current_period_end)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id,
                plan = excluded.plan, status = excluded.status,
                current_period_end = excluded.current_period_end, updated_at = CURRENT_TIMESTAMP`,
        args: [userId, best ? `google:${best.purchaseKey}` : customerKey,
          best?.plan ?? product.plan, best ? "active" : "canceled",
          best?.currentPeriodEnd ?? periodEnd ?? new Date().toISOString()],
      });
    }
    if (product.plan === "program" && purchase.active) {
      await tx.execute({
        sql: "UPDATE billing SET program_at = COALESCE(program_at, CURRENT_TIMESTAMP) WHERE user_id = ?",
        args: [userId],
      });
    }
    await tx.commit();
    // This is the purchased product, NOT necessarily the selected entitlement;
    // acknowledgement and conversion metadata must refer to the same purchase.
    return { ok: true, plan: product.plan, newlyRecorded: claim.newlyRecorded };
  } finally {
    tx.close();
  }
}

/**
 * Refreshes Google subscriptions that are at (or past) their stored period
 * end: renewals push the expiry forward, lapsed ones flip to canceled. Runs
 * from the hourly cron; cheap because it only touches rows near expiry.
 */
export async function refreshGoogleSubscriptions(client: Client = db(), now: Date = new Date()): Promise<{ refreshed: number; lapsed: number }> {
  if (!playStoreConfigured()) return { refreshed: 0, lapsed: 0 };
  await client.executeMultiple(GOOGLE_ENTITLEMENT_SCHEMA);
  const soon = new Date(now.getTime() + 12 * 3600_000).toISOString();
  const recentlyExpired = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  const rows = await client.execute({
    sql: `SELECT candidates.user_id, candidates.purchase_key FROM (
            SELECT user_id, purchase_key, verified_at
            FROM google_purchase_entitlements
            WHERE plan IN ('monthly','annual','maintenance') AND current_period_end <= ?
              AND (status = 'active' OR current_period_end >= ?)
            UNION ALL
            SELECT b.user_id, substr(b.stripe_customer_id, 8), 0 AS verified_at FROM billing b
            WHERE b.stripe_customer_id LIKE 'google:%' AND b.status = 'active'
              AND b.plan IN ('monthly','annual','maintenance') AND b.current_period_end <= ?
              AND NOT EXISTS (SELECT 1 FROM google_purchase_entitlements g
                              WHERE g.purchase_key = substr(b.stripe_customer_id, 8))
          ) candidates LEFT JOIN google_purchase_refresh_attempts attempts
            ON attempts.purchase_key = candidates.purchase_key
          ORDER BY COALESCE(attempts.checked_at, 0) ASC, candidates.verified_at ASC,
            candidates.purchase_key ASC LIMIT 25`,
    args: [soon, recentlyExpired, soon],
  });
  let refreshed = 0, lapsed = 0;
  const accessToken = await playAccessToken();
  if (!accessToken) return { refreshed, lapsed };
  for (const row of rows.rows) {
    const token = String(row.purchase_key);
    let purchase: GooglePurchase | null = null;
    try {
      purchase = await fetchSubscriptionPurchase(token, accessToken);
    } catch {
      // A network failure is neither revocation nor a reason to starve the
      // remaining queue. Keep the last verified state and try another token.
    } finally {
      await client.execute({
        sql: `INSERT INTO google_purchase_refresh_attempts (purchase_key, user_id, checked_at)
              VALUES (?, ?, ?) ON CONFLICT(purchase_key) DO UPDATE
              SET checked_at = excluded.checked_at`,
        args: [token, String(row.user_id), Date.now()],
      });
    }
    if (!purchase) continue;
    const result = await applyGooglePurchase(purchase, token, String(row.user_id), client);
    if (!result.ok || result.stale) continue;
    if (purchase.active) refreshed++; else lapsed++;
  }
  return { refreshed, lapsed };
}

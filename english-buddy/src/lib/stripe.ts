import { createHmac, timingSafeEqual } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { OWNER_ID } from "@/lib/auth";

/**
 * Stripe integration via plain REST (no SDK dependency, same approach as
 * Resend). Products and prices are created lazily with lookup keys, so no
 * manual dashboard setup is needed.
 */

const API = "https://api.stripe.com/v1";

export type Plan = "monthly" | "program" | "maintenance";

export const PLANS: Record<Plan, { lookupKey: string; name: string; amount: number; interval?: "month" }> = {
  monthly: { lookupKey: "execlingo_monthly", name: "ExecLingo — Mensile", amount: 3990, interval: "month" },
  program: { lookupKey: "execlingo_program", name: "ExecLingo — Programma 3 mesi", amount: 9990 },
  maintenance: { lookupKey: "execlingo_maintenance", name: "ExecLingo — Mantenimento", amount: 2990, interval: "month" },
};

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripeTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}

async function stripeFetch(path: string, params?: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(`${API}${path}`, {
    method: params ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: params ? new URLSearchParams(params).toString() : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = (data.error as { message?: string } | undefined)?.message ?? response.statusText;
    throw new Error(`Stripe ${path}: ${message}`);
  }
  return data;
}

// Price ids cached per serverless instance; looked up (or created) by lookup key.
const priceCache = new Map<Plan, string>();

export async function ensurePriceId(plan: Plan): Promise<string> {
  const cached = priceCache.get(plan);
  if (cached) return cached;
  const def = PLANS[plan];
  const found = await stripeFetch(`/prices?lookup_keys[]=${encodeURIComponent(def.lookupKey)}&active=true&limit=1`);
  const rows = (found.data as Array<{ id: string }> | undefined) ?? [];
  let id = rows[0]?.id;
  if (!id) {
    // Managed Payments requires a product tax code (electronically supplied services).
    const product = await stripeFetch("/products", { name: def.name, tax_code: "txcd_10000000" });
    const params: Record<string, string> = {
      product: String(product.id),
      currency: "eur",
      unit_amount: String(def.amount),
      lookup_key: def.lookupKey,
      // Italian consumer pricing: what you see is what you pay, VAT included.
      tax_behavior: "inclusive",
    };
    if (def.interval) params["recurring[interval]"] = def.interval;
    const price = await stripeFetch("/prices", params);
    id = String(price.id);
  }
  priceCache.set(plan, id);
  return id;
}

/** Creates a Stripe Checkout session and returns its hosted-page URL. */
export async function createCheckout(userId: string, email: string | null, plan: Plan, baseUrl: string): Promise<string> {
  const price = await ensurePriceId(plan);
  const def = PLANS[plan];
  const params: Record<string, string> = {
    mode: def.interval ? "subscription" : "payment",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: `${baseUrl}/abbonamento?esito=ok`,
    cancel_url: `${baseUrl}/abbonamento?esito=annullato`,
    client_reference_id: userId,
    "metadata[userId]": userId,
    "metadata[plan]": plan,
    locale: "it",
    allow_promotion_codes: "true",
    // Italian product, euro only — no adaptive currency conversion.
    "adaptive_pricing[enabled]": "false",
  };
  if (email) params.customer_email = email;
  if (def.interval) {
    params["subscription_data[metadata][userId]"] = userId;
    params["subscription_data[metadata][plan]"] = plan;
  } else {
    // One-time program purchase: create the customer so future events map back.
    params.customer_creation = "always";
  }
  const session = await stripeFetch("/checkout/sessions", params);
  return String(session.url);
}

/** Verifies a Stripe-Signature header (t=...,v1=...) against the raw payload. */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, nowSeconds?: number): boolean {
  if (!header) return false;
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key?.trim() === "t") timestamp = value ?? "";
    if (key?.trim() === "v1" && value) signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return false;
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return signatures.some((signature) => {
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  });
}

/**
 * Team checkout: one payment for N seats at the tiered unit price. The
 * webhook turns the completed order into license codes.
 */
export async function createTeamCheckout(
  order: { companyName: string; buyerEmail: string; quantity: number; unitAmount: number },
  baseUrl: string
): Promise<string> {
  const params: Record<string, string> = {
    mode: "payment",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][product_data][name]": "ExecLingo — Programma 3 mesi · licenza team",
    "line_items[0][price_data][product_data][tax_code]": "txcd_10000000",
    "line_items[0][price_data][tax_behavior]": "inclusive",
    "line_items[0][price_data][unit_amount]": String(order.unitAmount),
    "line_items[0][quantity]": String(order.quantity),
    customer_email: order.buyerEmail,
    // payment mode + tax-id collection requires a full customer object
    customer_creation: "always",
    "metadata[b2b]": "1",
    "metadata[company]": order.companyName.slice(0, 200),
    "metadata[qty]": String(order.quantity),
    success_url: `${baseUrl}/aziende?esito=ok`,
    cancel_url: `${baseUrl}/aziende?esito=annullato`,
    locale: "it",
    billing_address_collection: "required",
    "tax_id_collection[enabled]": "true",
    "adaptive_pricing[enabled]": "false",
  };
  const session = await stripeFetch("/checkout/sessions", params);
  return String(session.url);
}

// ---------- billing state (self-healing schema, like analytics) ----------

const BILLING_SCHEMA = `CREATE TABLE IF NOT EXISTS billing (
  user_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT,
  plan TEXT,
  status TEXT,
  current_period_end TEXT,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_billing_customer ON billing(stripe_customer_id);`;

export type BillingRow = {
  userId: string;
  stripeCustomerId: string | null;
  plan: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
};

export async function saveBilling(
  row: { userId: string; stripeCustomerId?: string | null; plan?: string | null; status?: string | null; currentPeriodEnd?: string | null },
  client: Client = db()
): Promise<void> {
  const upsert = () =>
    client.execute({
      sql: `INSERT INTO billing (user_id, stripe_customer_id, plan, status, current_period_end, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
              stripe_customer_id = COALESCE(excluded.stripe_customer_id, billing.stripe_customer_id),
              plan = COALESCE(excluded.plan, billing.plan),
              status = COALESCE(excluded.status, billing.status),
              current_period_end = COALESCE(excluded.current_period_end, billing.current_period_end),
              updated_at = CURRENT_TIMESTAMP`,
      args: [row.userId, row.stripeCustomerId ?? null, row.plan ?? null, row.status ?? null, row.currentPeriodEnd ?? null],
    });
  try {
    await upsert();
  } catch {
    await client.executeMultiple(BILLING_SCHEMA);
    await upsert();
  }
}

export async function getBilling(userId: string, client: Client = db()): Promise<BillingRow | null> {
  try {
    const result = await client.execute({ sql: "SELECT * FROM billing WHERE user_id = ? LIMIT 1", args: [userId] });
    const r = result.rows[0];
    if (!r) return null;
    return {
      userId: String(r.user_id),
      stripeCustomerId: r.stripe_customer_id ? String(r.stripe_customer_id) : null,
      plan: r.plan ? String(r.plan) : null,
      status: r.status ? String(r.status) : null,
      currentPeriodEnd: r.current_period_end ? String(r.current_period_end) : null,
    };
  } catch {
    return null;
  }
}

export async function userIdByCustomer(customerId: string, client: Client = db()): Promise<string | null> {
  try {
    const result = await client.execute({ sql: "SELECT user_id FROM billing WHERE stripe_customer_id = ? LIMIT 1", args: [customerId] });
    return result.rows[0] ? String(result.rows[0].user_id) : null;
  } catch {
    return null;
  }
}

// ---------- entitlement ----------

export type Entitlement = { access: boolean; reason: "owner" | "plan" | "free" | "locked"; plan?: string | null };

/** Paywall is ON by default; BILLING_ENFORCED=0 switches it off for testing. */
export function billingEnforced(): boolean {
  return process.env.BILLING_ENFORCED !== "0";
}

/**
 * Who trains with Sam: the owner always; anyone with an active plan (3-day
 * grace past the period end); accounts granted free access ("comp") from the
 * admin dashboard. Everyone else can browse the app but starting an activity
 * requires a plan — except the free level-check promised on the landing.
 */
export async function getEntitlement(userId: string, client: Client = db()): Promise<Entitlement> {
  if (userId === OWNER_ID) return { access: true, reason: "owner" };

  const billing = await getBilling(userId, client);
  if (billing?.status === "active") {
    if (billing.plan === "free") return { access: true, reason: "free", plan: "free" };
    const end = billing.currentPeriodEnd ? Date.parse(billing.currentPeriodEnd) : null;
    if (!end || end + 3 * 86_400_000 > Date.now()) return { access: true, reason: "plan", plan: billing.plan };
  }
  return { access: false, reason: "locked", plan: billing?.plan ?? null };
}

export const PAYWALL_MESSAGE =
  "Per allenarti con Sam serve un piano attivo. Vai su Profilo → 💳 Abbonamento e piani (o inserisci lì il tuo codice aziendale).";

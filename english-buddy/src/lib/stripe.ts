import { createHmac, timingSafeEqual } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { OWNER_ID } from "@/lib/auth";
import { readTrial } from "@/lib/marketing/trial";
import { BILLING_GRACE_MS, googleEntitlementState, type BillingExecutor } from "@/lib/google-entitlements";

/**
 * Stripe integration via plain REST (no SDK dependency, same approach as
 * Resend). Products and prices are created lazily with lookup keys, so no
 * manual dashboard setup is needed.
 */

const API = "https://api.stripe.com/v1";

export type Plan = "monthly" | "annual" | "program" | "maintenance";

export const PLANS: Record<Plan, { lookupKey: string; name: string; amount: number; interval?: "month" | "year" }> = {
  monthly: { lookupKey: "execlingo_monthly", name: "ExecLingo — Mensile", amount: 3990, interval: "month" },
  annual: { lookupKey: "execlingo_annual", name: "ExecLingo — Annuale", amount: 19900, interval: "year" },
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

/**
 * Stripe's own billing portal: where a web subscriber changes their card,
 * downloads invoices or cancels. Store subscriptions never come through here
 * — Apple and Google only let their own settings screens cancel them.
 */
export async function createBillingPortal(customerId: string, returnUrl: string): Promise<string> {
  const session = await stripeFetch("/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
  return String(session.url);
}

// Price ids cached per serverless instance; looked up (or created) by lookup key.
const priceCache = new Map<Plan, string>();

export async function ensurePriceId(plan: Plan): Promise<string> {
  const cached = priceCache.get(plan);
  if (cached) return cached;
  const def = PLANS[plan];
  const found = await stripeFetch(`/prices?lookup_keys[]=${encodeURIComponent(def.lookupKey)}&active=true&limit=1`);
  const rows = (found.data as Array<{
    id: string;
    unit_amount?: number | null;
    currency?: string;
    recurring?: { interval?: string; interval_count?: number } | null;
  }> | undefined) ?? [];
  const existing = rows[0];
  if (existing && (
    existing.unit_amount !== def.amount ||
    existing.currency?.toLowerCase() !== "eur" ||
    (def.interval
      ? existing.recurring?.interval !== def.interval || existing.recurring?.interval_count !== 1
      : Boolean(existing.recurring))
  )) {
    throw new Error(`Stripe price ${def.lookupKey} does not match the published ExecLingo plan`);
  }
  let id = existing?.id;
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
    // Professionals with a VAT number get a correctly addressed invoice.
    "tax_id_collection[enabled]": "true",
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

/** Prepare legacy billing columns before opening a purchase transaction. */
export async function ensureBillingSchema(client: Client): Promise<void> {
  await client.executeMultiple(BILLING_SCHEMA);
  const hasProgramAt = async () => (await client.execute("PRAGMA table_info(billing)"))
    .rows.some((column) => column.name === "program_at");
  if (!await hasProgramAt()) {
    try {
      await client.execute("ALTER TABLE billing ADD COLUMN program_at TEXT");
    } catch (error) {
      // Another request may have added it; do not swallow genuine failures.
      if (!await hasProgramAt()) throw error;
    }
  }
}

export type BillingRow = {
  userId: string;
  stripeCustomerId: string | null;
  plan: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  /** When the 3-month programme was first bought; never cleared. */
  programAt: string | null;
};

/**
 * Maintenance is the plan that comes *after* the programme — that is what its
 * lower price pays for. It unlocks once the programme has been bought, and
 * stays unlocked for whoever is already on it, so an active subscriber is
 * never locked out of their own plan.
 */
/**
 * True when the plan was actually bought with a card on the site. Store
 * purchases are recorded in the same column with their own key
 * ("google:<token>", "apple:<id>"), and only a real Stripe customer can open
 * the billing portal.
 */
export function isStripeCustomer(billing: BillingRow | null): boolean {
  return !!billing?.stripeCustomerId?.startsWith("cus_");
}

export function maintenanceUnlocked(billing: BillingRow | null): boolean {
  return !!billing && (!!billing.programAt || billing.plan === "program" || billing.plan === "maintenance");
}

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
  // Stamped separately so a database that predates the column cannot break the
  // upsert itself: the plan must be recorded even if the stamp fails.
  if (row.plan === "program") await stampProgram(row.userId, client);
}

async function stampProgram(userId: string, client: Client): Promise<void> {
  const stamp = () =>
    client.execute({
      sql: "UPDATE billing SET program_at = COALESCE(program_at, CURRENT_TIMESTAMP) WHERE user_id = ?",
      args: [userId],
    });
  try {
    await stamp();
  } catch {
    await client.execute("ALTER TABLE billing ADD COLUMN program_at TEXT").catch(() => undefined);
    await stamp().catch(() => undefined);
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
      programAt: r.program_at ? String(r.program_at) : null,
    };
  } catch {
    return null;
  }
}

export async function userIdByCustomer(customerId: string, client: BillingExecutor = db()): Promise<string | null> {
  try {
    const result = await client.execute({ sql: "SELECT user_id FROM billing WHERE stripe_customer_id = ? LIMIT 1", args: [customerId] });
    return result.rows[0] ? String(result.rows[0].user_id) : null;
  } catch {
    return null;
  }
}

// ---------- entitlement ----------

export type Entitlement = { access: boolean; reason: "owner" | "plan" | "free" | "trial" | "locked"; plan?: string | null; currentPeriodEnd?: string | null };

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
  if (billing?.status === "active" && billing.plan === "free") return { access: true, reason: "free", plan: "free" };
  const google = await googleEntitlementState(userId, billing?.stripeCustomerId ?? null, client);
  // Once a token has an authoritative ledger row, the legacy summary cannot
  // resurrect it after revocation. Non-Google billing remains independent.
  if (billing?.status === "active" && !google.currentKnown) {
    const end = billing.currentPeriodEnd ? Date.parse(billing.currentPeriodEnd) : null;
    if (!end || end + BILLING_GRACE_MS > Date.now()) return { access: true, reason: "plan", plan: billing.plan, currentPeriodEnd: billing.currentPeriodEnd };
  }
  if (google.best) return { access: true, reason: "plan", plan: google.best.plan, currentPeriodEnd: google.best.currentPeriodEnd };

  // Only once every paid route has said no: the free trial is a way in for
  // people who have not bought, never a discount for people who have. Reading
  // it here also means it expires on its own, with no job to run.
  const trial = await readTrial(userId, client);
  if (trial?.active) return { access: true, reason: "trial", plan: billing?.plan ?? null };

  return { access: false, reason: "locked", plan: billing?.plan ?? null };
}

export const PAYWALL_MESSAGE =
  "Per allenarti con Sam serve un piano attivo. Vai su Profilo → 💳 Abbonamento e piani (o inserisci lì il tuo codice aziendale).";

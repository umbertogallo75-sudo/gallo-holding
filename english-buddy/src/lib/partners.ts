import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";

/**
 * Partner / affiliate commercial system: self-service partners, referral
 * attribution, offline leads, commission ledger with the platform-wide 5%
 * cap, 30-day hold, payouts. Financial truth lives in the `commissions`
 * ledger, fed only by verified Stripe webhook events.
 */

export const MAX_COMMISSION_RATE = 5;
export const DEFAULT_COMMISSION_RATE = 5;
export const ATTRIBUTION_DAYS = 30;
export const HOLDING_DAYS = 30;
export const LEAD_PROTECTION_DAYS = 60;
export const MIN_PAYOUT_CENTS = 5000;
export const TERMS_VERSION = "2026-08-v1";
export const VAT_RATE = 0.22;

export const PARTNER_TYPES = [
  "AFFILIATE",
  "SALES_AGENT",
  "AMBASSADOR",
  "INFLUENCER",
  "CONSULTANT",
  "CORPORATE_PARTNER",
  "INTERNAL_SALES",
  "OTHER",
] as const;

export const PARTNER_STATUSES = ["ACTIVE", "SUSPENDED", "TERMINATED", "BLOCKED", "REVIEW_REQUIRED", "REJECTED"] as const;

export const RATE_ERROR = "ExecLingo allows a maximum partner commission of 5%. · La provvigione massima è il 5%.";

/** The ONLY gate for commission rates — used by every layer. Throws above 5%. */
export function assertValidRate(rate: number): number {
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > MAX_COMMISSION_RATE) {
    throw new Error(RATE_ERROR);
  }
  return rate;
}

// Schema self-heals like analytics/billing: first use creates the tables.
let schemaSql: string | null = null;
function partnerSchema(): string {
  if (!schemaSql) schemaSql = readFileSync(join(process.cwd(), "db", "migrations", "0014_partners.sql"), "utf8");
  return schemaSql;
}

async function withSchema<T>(client: Client, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    await client.executeMultiple(partnerSchema());
    return run();
  }
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Human referral code from the name, e.g. MARIO-7K2M. */
function makeRefCode(name: string): string {
  const base = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "PARTNER";
  const bytes = randomBytes(4);
  let suffix = "";
  for (let i = 0; i < 4; i += 1) suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `${base}-${suffix}`;
}

export type Partner = {
  userId: string;
  name: string;
  email: string | null;
  country: string | null;
  partnerType: string;
  status: string;
  refCode: string;
  commissionRate: number;
  payoutDocsStatus: string;
  payoutMethod: string | null;
  createdAt: string;
};

function rowToPartner(r: Record<string, unknown>): Partner {
  return {
    userId: String(r.user_id),
    name: String(r.name),
    email: r.email ? String(r.email) : null,
    country: r.country ? String(r.country) : null,
    partnerType: String(r.partner_type),
    status: String(r.status),
    refCode: String(r.ref_code),
    commissionRate: Number(r.commission_rate),
    payoutDocsStatus: String(r.payout_docs_status),
    payoutMethod: r.payout_method ? String(r.payout_method) : null,
    createdAt: String(r.created_at),
  };
}

export async function getPartner(userId: string, client: Client = db()): Promise<Partner | null> {
  return withSchema(client, async () => {
    const result = await client.execute({ sql: "SELECT * FROM partners WHERE user_id = ? LIMIT 1", args: [userId] });
    return result.rows[0] ? rowToPartner(result.rows[0]) : null;
  });
}

export async function getPartnerByCode(code: string, client: Client = db()): Promise<Partner | null> {
  return withSchema(client, async () => {
    const result = await client.execute({ sql: "SELECT * FROM partners WHERE ref_code = ? LIMIT 1", args: [code.trim().toUpperCase()] });
    return result.rows[0] ? rowToPartner(result.rows[0]) : null;
  });
}

/** Self-service activation: instant ACTIVE status with the standard 5% plan. */
export async function createPartner(
  input: { userId: string; name: string; email: string | null; country: string; partnerType: string },
  client: Client = db()
): Promise<Partner> {
  const rate = assertValidRate(DEFAULT_COMMISSION_RATE);
  return withSchema(client, async () => {
    const existing = await client.execute({ sql: "SELECT * FROM partners WHERE user_id = ? LIMIT 1", args: [input.userId] });
    if (existing.rows[0]) return rowToPartner(existing.rows[0]);
    let code = makeRefCode(input.name);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await client.execute({
          sql: `INSERT INTO partners (user_id, name, email, country, partner_type, status, ref_code, commission_rate, terms_version, terms_accepted_at)
                VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, CURRENT_TIMESTAMP)`,
          args: [input.userId, input.name, input.email, input.country, input.partnerType, code, rate, TERMS_VERSION],
        });
        break;
      } catch (error) {
        if (attempt === 3) throw error;
        code = makeRefCode(input.name);
      }
    }
    await audit(input.userId, "partner_self_activated", input.userId, `type=${input.partnerType} code=${code}`, client);
    const created = await client.execute({ sql: "SELECT * FROM partners WHERE user_id = ? LIMIT 1", args: [input.userId] });
    return rowToPartner(created.rows[0]);
  });
}

export async function setPartnerRate(actor: string, partnerId: string, rate: number, client: Client = db()): Promise<void> {
  assertValidRate(rate);
  await withSchema(client, async () => {
    await client.execute({ sql: "UPDATE partners SET commission_rate = ? WHERE user_id = ?", args: [rate, partnerId] });
    await audit(actor, "commission_rate_changed", partnerId, `rate=${rate}`, client);
  });
}

export async function setPartnerStatus(actor: string, partnerId: string, status: string, client: Client = db()): Promise<void> {
  if (!PARTNER_STATUSES.includes(status as (typeof PARTNER_STATUSES)[number])) throw new Error("Invalid status");
  await withSchema(client, async () => {
    await client.execute({ sql: "UPDATE partners SET status = ? WHERE user_id = ?", args: [status, partnerId] });
    await audit(actor, "partner_status_changed", partnerId, `status=${status}`, client);
  });
}

export async function audit(actor: string, action: string, entity: string | null, detail: string | null, client: Client = db()): Promise<void> {
  await withSchema(client, async () => {
    await client.execute({
      sql: "INSERT INTO partner_audit (id, actor, action, entity, detail) VALUES (?, ?, ?, ?, ?)",
      args: [randomUUID(), actor, action, entity, detail],
    });
  });
}

export async function recordClick(partnerId: string, campaign: string | null, client: Client = db()): Promise<void> {
  await withSchema(client, async () => {
    await client.execute({
      sql: "INSERT INTO partner_clicks (id, partner_id, campaign) VALUES (?, ?, ?)",
      args: [randomUUID(), partnerId, campaign],
    });
  });
}

/**
 * Attributes a brand-new user to a partner. Self-referrals are silently
 * dropped; existing attributions are never overwritten (first valid wins at
 * signup time — there is one attribution decision, made once).
 */
export async function attributeSignup(
  input: { userId: string; email: string | null; refCode?: string | null; campaign?: string | null },
  client: Client = db()
): Promise<string | null> {
  return withSchema(client, async () => {
    let partner: Partner | null = null;
    let source = "link";
    if (input.refCode) partner = await getPartnerByCode(input.refCode, client);
    // Offline lead protection: a registered lead's email wins when no link is present.
    if (!partner && input.email) {
      const lead = await client.execute({
        sql: `SELECT id, partner_id FROM partner_leads WHERE email = ? AND status = 'open'
              AND (protected_until IS NULL OR protected_until > datetime('now')) ORDER BY created_at ASC LIMIT 1`,
        args: [input.email],
      });
      if (lead.rows[0]) {
        const leadPartner = await getPartner(String(lead.rows[0].partner_id), client);
        if (leadPartner) {
          partner = leadPartner;
          source = "lead";
          await client.execute({ sql: "UPDATE partner_leads SET status = 'converted' WHERE id = ?", args: [String(lead.rows[0].id)] });
        }
      }
    }
    if (!partner || partner.status !== "ACTIVE") return null;
    // Self-referral: same account or same email is never commissionable.
    if (partner.userId === input.userId || (partner.email && input.email && partner.email.toLowerCase() === input.email.toLowerCase())) {
      await audit("system", "self_referral_blocked", input.userId, `partner=${partner.userId}`, client);
      return null;
    }
    await client.execute({
      sql: "INSERT OR IGNORE INTO partner_attributions (user_id, partner_id, ref_code, campaign, source) VALUES (?, ?, ?, ?, ?)",
      args: [input.userId, partner.userId, partner.refCode, input.campaign ?? null, source],
    });
    return partner.userId;
  });
}

/**
 * Commission engine: called from the Stripe webhook for each verified paid
 * event. Idempotent on paymentRef. Net revenue excludes VAT; the rate is
 * re-clamped at write time so nothing above 5% can ever enter the ledger.
 */
export async function recordCommission(
  input: {
    userId: string;
    paymentRef: string;
    paymentIntent?: string | null;
    plan?: string | null;
    grossCents: number;
    taxCents?: number | null;
    currency?: string;
  },
  client: Client = db()
): Promise<{ recorded: boolean; amountCents?: number; partnerId?: string }> {
  return withSchema(client, async () => {
    const attribution = await client.execute({ sql: "SELECT partner_id, created_at FROM partner_attributions WHERE user_id = ? LIMIT 1", args: [input.userId] });
    const row = attribution.rows[0];
    if (!row) return { recorded: false };
    // Attribution window: the first payment must happen within it.
    const attributedAt = Date.parse(String(row.created_at));
    if (Number.isFinite(attributedAt) && Date.now() - attributedAt > ATTRIBUTION_DAYS * 86_400_000) return { recorded: false };
    const partner = await getPartner(String(row.partner_id), client);
    if (!partner || partner.status !== "ACTIVE") return { recorded: false };

    const rate = assertValidRate(Math.min(partner.commissionRate, MAX_COMMISSION_RATE));
    const net = input.taxCents != null ? input.grossCents - input.taxCents : Math.round(input.grossCents / (1 + VAT_RATE));
    const amount = Math.round((net * rate) / 100);
    const availableAt = new Date(Date.now() + HOLDING_DAYS * 86_400_000).toISOString();
    const result = await client.execute({
      sql: `INSERT OR IGNORE INTO commissions (id, partner_id, user_id, payment_ref, payment_intent, plan, revenue_cents, net_cents, rate, amount_cents, currency, status, available_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      args: [randomUUID(), partner.userId, input.userId, input.paymentRef, input.paymentIntent ?? null, input.plan ?? null, input.grossCents, net, rate, amount, input.currency ?? "eur", availableAt],
    });
    return Number(result.rowsAffected) > 0 ? { recorded: true, amountCents: amount, partnerId: partner.userId } : { recorded: false };
  });
}

/** Full refund/chargeback: reverse the matching ledger entry, never delete. */
export async function reverseCommission(paymentIntent: string, reason: string, client: Client = db()): Promise<boolean> {
  return withSchema(client, async () => {
    const result = await client.execute({
      sql: `UPDATE commissions SET status = 'reversed', reversed_at = CURRENT_TIMESTAMP, reversal_reason = ?
            WHERE payment_intent = ? AND status IN ('pending', 'available')`,
      args: [reason, paymentIntent],
    });
    return Number(result.rowsAffected) > 0;
  });
}

/** Lazy hold promotion: pending entries past their hold become available. */
export async function promoteHeldCommissions(client: Client = db()): Promise<void> {
  await withSchema(client, async () => {
    await client.execute("UPDATE commissions SET status = 'available' WHERE status = 'pending' AND available_at <= datetime('now')");
  });
}

export type PartnerStats = {
  clicks: number;
  registrations: number;
  customers: number;
  revenueCents: number;
  pendingCents: number;
  availableCents: number;
  paidCents: number;
};

export async function partnerStats(partnerId: string, client: Client = db()): Promise<PartnerStats> {
  return withSchema(client, async () => {
    await promoteHeldCommissions(client);
    const [clicks, regs, ledger] = await Promise.all([
      client.execute({ sql: "SELECT COUNT(*) AS c FROM partner_clicks WHERE partner_id = ?", args: [partnerId] }),
      client.execute({ sql: "SELECT COUNT(*) AS c FROM partner_attributions WHERE partner_id = ?", args: [partnerId] }),
      client.execute({
        sql: `SELECT status, COUNT(DISTINCT user_id) AS customers, SUM(revenue_cents) AS revenue, SUM(amount_cents) AS amount
              FROM commissions WHERE partner_id = ? GROUP BY status`,
        args: [partnerId],
      }),
    ]);
    const stats: PartnerStats = {
      clicks: Number(clicks.rows[0]?.c ?? 0),
      registrations: Number(regs.rows[0]?.c ?? 0),
      customers: 0,
      revenueCents: 0,
      pendingCents: 0,
      availableCents: 0,
      paidCents: 0,
    };
    const customerIds = new Set<string>();
    for (const r of ledger.rows) {
      const status = String(r.status);
      if (status !== "reversed") {
        stats.revenueCents += Number(r.revenue ?? 0);
        customerIds.add(String(r.customers));
        stats.customers += Number(r.customers ?? 0);
      }
      if (status === "pending") stats.pendingCents += Number(r.amount ?? 0);
      if (status === "available") stats.availableCents += Number(r.amount ?? 0);
      if (status === "paid") stats.paidCents += Number(r.amount ?? 0);
    }
    return stats;
  });
}

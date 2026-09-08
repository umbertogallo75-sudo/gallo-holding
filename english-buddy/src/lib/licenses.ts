import { randomBytes } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { saveBilling } from "@/lib/stripe";

/**
 * Team licenses: a company buys N seats in one checkout; the webhook turns
 * them into license codes; each employee redeems one code and gets the
 * 3-month program prepaid.
 */

const SCHEMA = `CREATE TABLE IF NOT EXISTS licenses (
  code TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  company_name TEXT,
  buyer_email TEXT,
  plan TEXT NOT NULL DEFAULT 'program',
  status TEXT NOT NULL DEFAULT 'unused',
  redeemed_by TEXT,
  redeemed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_licenses_order ON licenses(order_id);`;

export const MIN_TEAM_SEATS = 10;
export const MAX_TEAM_SEATS = 1000;

export type TeamPlan = "program" | "annual";

/**
 * The two team packages. Both carry the same volume ladder — 10+ −5%,
 * 50+ −10%, 150+ −15% — each rounded down to the price ending its own
 * full price already uses, so the tiers read as prices rather than as
 * arithmetic. `days` is how long a redeemed seat stays entitled: the
 * package plus a week of courtesy, as the consumer purchases get.
 */
export const TEAM_PLANS: Record<TeamPlan, { label: string; full: number; tiers: [number, number, number]; days: number }> = {
  program: { label: "Programma 3 mesi", full: 9990, tiers: [9490, 8990, 8490], days: 98 },
  annual: { label: "Annuale 12 mesi", full: 19900, tiers: [18900, 17900, 16900], days: 372 },
};

export function isTeamPlan(value: unknown): value is TeamPlan {
  return value === "program" || value === "annual";
}

export function teamUnitAmount(quantity: number, plan: TeamPlan = "program"): number | null {
  if (quantity < MIN_TEAM_SEATS || quantity > MAX_TEAM_SEATS) return null;
  const [ten, fifty, hundredFifty] = TEAM_PLANS[plan].tiers;
  if (quantity >= 150) return hundredFifty;
  if (quantity >= 50) return fifty;
  return ten;
}

// Unambiguous alphabet (no 0/O, 1/I/L) for codes read out loud or retyped.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makeCode(): string {
  const bytes = randomBytes(8);
  let raw = "";
  for (let i = 0; i < 8; i += 1) raw += ALPHABET[bytes[i] % ALPHABET.length];
  return `EXEC-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

async function withSchema<T>(client: Client, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    await client.executeMultiple(SCHEMA);
    return run();
  }
}

/** Idempotent per order: a webhook retry returns the codes already issued. */
export async function generateLicenses(
  order: { orderId: string; companyName: string; buyerEmail: string; quantity: number; plan?: TeamPlan },
  client: Client = db()
): Promise<string[]> {
  const plan: TeamPlan = order.plan ?? "program";
  return withSchema(client, async () => {
    const existing = await client.execute({ sql: "SELECT code FROM licenses WHERE order_id = ?", args: [order.orderId] });
    if (existing.rows.length > 0) return existing.rows.map((r) => String(r.code));
    const codes: string[] = [];
    for (let i = 0; i < order.quantity; i += 1) {
      let code = makeCode();
      // Retry on the (astronomically rare) collision.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await client.execute({
            sql: "INSERT INTO licenses (code, order_id, company_name, buyer_email, plan) VALUES (?, ?, ?, ?, ?)",
            args: [code, order.orderId, order.companyName, order.buyerEmail, plan],
          });
          break;
        } catch (error) {
          if (attempt === 2) throw error;
          code = makeCode();
        }
      }
      codes.push(code);
    }
    return codes;
  });
}

export type RedeemResult =
  | { ok: true; companyName: string | null; plan: TeamPlan }
  | { ok: false; reason: "not_found" | "already_used" };

/** Marks a license redeemed and activates the package the code was sold as. */
export async function redeemLicense(code: string, userId: string, client: Client = db()): Promise<RedeemResult> {
  const normalized = code.trim().toUpperCase();
  return withSchema(client, async () => {
    const found = await client.execute({ sql: "SELECT code, status, company_name, plan FROM licenses WHERE code = ? LIMIT 1", args: [normalized] });
    const row = found.rows[0];
    if (!row) return { ok: false, reason: "not_found" };
    if (String(row.status) !== "unused") return { ok: false, reason: "already_used" };
    // Codes sold before the annual package existed carry no usable plan.
    const plan: TeamPlan = isTeamPlan(row.plan) ? row.plan : "program";
    const updated = await client.execute({
      sql: "UPDATE licenses SET status = 'redeemed', redeemed_by = ?, redeemed_at = CURRENT_TIMESTAMP WHERE code = ? AND status = 'unused'",
      args: [userId, normalized],
    });
    if (Number(updated.rowsAffected) === 0) return { ok: false, reason: "already_used" };
    await saveBilling(
      { userId, plan, status: "active", currentPeriodEnd: new Date(Date.now() + TEAM_PLANS[plan].days * 86_400_000).toISOString() },
      client
    );
    return { ok: true, companyName: row.company_name ? String(row.company_name) : null, plan };
  });
}

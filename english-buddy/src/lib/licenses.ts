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

/** Volume tiers: 10+ → 5%, 50+ → 10%, 150+ → 15% off the 99.90 program. */
export function teamUnitAmount(quantity: number): number | null {
  if (quantity < MIN_TEAM_SEATS || quantity > MAX_TEAM_SEATS) return null;
  if (quantity >= 150) return 8490;
  if (quantity >= 50) return 8990;
  return 9490;
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
  order: { orderId: string; companyName: string; buyerEmail: string; quantity: number },
  client: Client = db()
): Promise<string[]> {
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
            sql: "INSERT INTO licenses (code, order_id, company_name, buyer_email) VALUES (?, ?, ?, ?)",
            args: [code, order.orderId, order.companyName, order.buyerEmail],
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

export type RedeemResult = { ok: true; companyName: string | null } | { ok: false; reason: "not_found" | "already_used" };

/** Marks a license redeemed and activates the program for the user. */
export async function redeemLicense(code: string, userId: string, client: Client = db()): Promise<RedeemResult> {
  const normalized = code.trim().toUpperCase();
  return withSchema(client, async () => {
    const found = await client.execute({ sql: "SELECT code, status, company_name FROM licenses WHERE code = ? LIMIT 1", args: [normalized] });
    const row = found.rows[0];
    if (!row) return { ok: false, reason: "not_found" };
    if (String(row.status) !== "unused") return { ok: false, reason: "already_used" };
    const updated = await client.execute({
      sql: "UPDATE licenses SET status = 'redeemed', redeemed_by = ?, redeemed_at = CURRENT_TIMESTAMP WHERE code = ? AND status = 'unused'",
      args: [userId, normalized],
    });
    if (Number(updated.rowsAffected) === 0) return { ok: false, reason: "already_used" };
    await saveBilling(
      { userId, plan: "program", status: "active", currentPeriodEnd: new Date(Date.now() + 98 * 86_400_000).toISOString() },
      client
    );
    return { ok: true, companyName: row.company_name ? String(row.company_name) : null };
  });
}

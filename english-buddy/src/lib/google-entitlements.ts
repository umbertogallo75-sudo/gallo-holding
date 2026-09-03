import type { Client } from "@libsql/client";

export type BillingExecutor = Pick<Client, "execute" | "executeMultiple">;
// Preserve the existing billing access grace; an explicit verified revocation
// still cancels immediately, regardless of the saved expiry.
export const BILLING_GRACE_MS = 3 * 86_400_000;

export const GOOGLE_ENTITLEMENT_SCHEMA = `CREATE TABLE IF NOT EXISTS google_purchase_entitlements (
  purchase_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled')),
  current_period_end TEXT,
  verified_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_google_entitlements_user ON google_purchase_entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_google_entitlements_refresh ON google_purchase_entitlements(status, current_period_end);
CREATE TABLE IF NOT EXISTS google_purchase_refresh_attempts (
  purchase_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  checked_at INTEGER NOT NULL
);`;

export type GoogleEntitlement = {
  purchaseKey: string;
  plan: string;
  currentPeriodEnd: string;
};

/** Read-only resolver; older databases may not have the additive ledger yet. */
export async function googleEntitlementState(
  userId: string,
  currentCustomerKey: string | null,
  client: BillingExecutor,
  now: number = Date.now(),
): Promise<{ best: GoogleEntitlement | null; currentKnown: boolean }> {
  let rows;
  try {
    rows = (await client.execute({
      sql: `SELECT purchase_key, plan, status, current_period_end
            FROM google_purchase_entitlements WHERE user_id = ?`,
      args: [userId],
    })).rows;
  } catch (error) {
    if (/no such table: (?:main\.)?google_purchase_entitlements/i.test(String(error))) {
      return { best: null, currentKnown: false };
    }
    throw error;
  }
  const currentKnown = rows.some((row) => `google:${String(row.purchase_key)}` === currentCustomerKey);
  const candidates = rows.flatMap((row) => {
    const end = row.current_period_end ? String(row.current_period_end) : "";
    const expiry = Date.parse(end);
    return row.status === "active" && Number.isFinite(expiry) && expiry + BILLING_GRACE_MS > now
      ? [{ purchaseKey: String(row.purchase_key), plan: String(row.plan), currentPeriodEnd: end }]
      : [];
  });
  candidates.sort((a, b) => Date.parse(b.currentPeriodEnd) - Date.parse(a.currentPeriodEnd)
    || a.purchaseKey.localeCompare(b.purchaseKey));
  return { best: candidates[0] ?? null, currentKnown };
}

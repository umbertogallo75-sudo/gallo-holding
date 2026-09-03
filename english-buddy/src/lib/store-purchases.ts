import { db } from "@/lib/db";
import type { BillingExecutor } from "@/lib/google-entitlements";

export type StoreProvider = "apple" | "google";

const SCHEMA = `CREATE TABLE IF NOT EXISTS store_purchase_owners (
  provider TEXT NOT NULL,
  purchase_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (provider, purchase_key)
);
CREATE INDEX IF NOT EXISTS idx_store_purchase_owner_user
  ON store_purchase_owners(user_id);`;

export async function ensureStorePurchaseSchema(client: BillingExecutor): Promise<void> {
  await client.executeMultiple(SCHEMA);
}

/** Returns the account that first claimed a store transaction. */
export async function storePurchaseOwner(
  provider: StoreProvider,
  purchaseKey: string,
  client: BillingExecutor = db()
): Promise<string | null> {
  const lookup = () => client.execute({
    sql: "SELECT user_id FROM store_purchase_owners WHERE provider = ? AND purchase_key = ? LIMIT 1",
    args: [provider, purchaseKey],
  });
  try {
    const result = await lookup();
    return result.rows[0] ? String(result.rows[0].user_id) : null;
  } catch {
    await ensureStorePurchaseSchema(client);
    const result = await lookup();
    return result.rows[0] ? String(result.rows[0].user_id) : null;
  }
}

/**
 * Atomically claims a verified store transaction for one account. INSERT OR
 * IGNORE makes concurrent confirmations converge on the first owner; a later
 * account can never take the same Apple transaction or Google purchase token.
 */
export async function claimStorePurchase(
  provider: StoreProvider,
  purchaseKey: string,
  userId: string,
  productId: string,
  client: BillingExecutor = db()
): Promise<boolean> {
  return (await claimStorePurchaseWithStatus(provider, purchaseKey, userId, productId, client)).ok;
}

/** Same ownership check plus whether this call created the ownership row. */
export async function claimStorePurchaseWithStatus(
  provider: StoreProvider,
  purchaseKey: string,
  userId: string,
  productId: string,
  client: BillingExecutor = db()
): Promise<{ ok: boolean; newlyRecorded: boolean }> {
  const claim = async () => {
    const inserted = await client.execute({
      sql: `INSERT OR IGNORE INTO store_purchase_owners
              (provider, purchase_key, user_id, product_id)
            VALUES (?, ?, ?, ?)`,
      args: [provider, purchaseKey, userId, productId],
    });
    const owner = await storePurchaseOwner(provider, purchaseKey, client);
    if (owner !== userId) return { ok: false, newlyRecorded: false };
    await client.execute({
      sql: `UPDATE store_purchase_owners
            SET product_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE provider = ? AND purchase_key = ? AND user_id = ?`,
      args: [productId, provider, purchaseKey, userId],
    });
    return { ok: true, newlyRecorded: inserted.rowsAffected > 0 };
  };
  try {
    return await claim();
  } catch {
    await ensureStorePurchaseSchema(client);
    return claim();
  }
}

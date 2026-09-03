import { randomUUID } from "node:crypto";
import type { Client, InStatement } from "@libsql/client";
import { db } from "@/lib/db";
import { emailHash } from "@/lib/marketing/suppression";

type UserTable = {
  table: string;
  column: string;
  required?: boolean;
};

/**
 * Account-owned rows. Optional tables were introduced progressively and may
 * legitimately be absent from an older database; an existing table that
 * cannot be deleted from is always an error.
 */
const USER_TABLES: UserTable[] = [
  { table: "messages", column: "user_id" },
  { table: "sessions", column: "user_id" },
  { table: "mistakes", column: "user_id" },
  { table: "expressions", column: "user_id" },
  { table: "daily_metrics", column: "user_id" },
  { table: "push_subscriptions", column: "user_id" },
  { table: "notification_history", column: "user_id" },
  { table: "apns_tokens", column: "user_id" },
  { table: "fcm_tokens", column: "user_id" },
  { table: "user_capabilities", column: "user_id" },
  { table: "learning_state", column: "user_id" },
  { table: "billing", column: "user_id" },
  { table: "store_purchase_owners", column: "user_id" },
  { table: "google_purchase_entitlements", column: "user_id" },
  { table: "google_purchase_refresh_attempts", column: "user_id" },
  { table: "analytics_events", column: "user_id" },
  { table: "events", column: "user_id" },
  { table: "user_attribution", column: "user_id" },
  { table: "consent_log", column: "user_id" },
  { table: "trials", column: "user_id" },
  { table: "email_prefs", column: "user_id" },
  { table: "email_sends", column: "user_id" },
  { table: "email_nudges", column: "user_id" },
  { table: "partner_attributions", column: "user_id" },
  // Keep the two account roots last. The batch is atomic, but this ordering
  // also remains safe if new foreign keys are introduced later.
  { table: "profiles", column: "id", required: true },
  { table: "auth_users", column: "id", required: true },
];

const SUPPRESSION_SCHEMA = `CREATE TABLE IF NOT EXISTS email_suppression (
  email_hash TEXT PRIMARY KEY,
  added_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  reason TEXT
)`;

async function existingTables(client: Client): Promise<Set<string>> {
  const result = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
  return new Set(result.rows.map((row) => String(row.name)));
}

/**
 * Removes one account in a single transaction. Commercial records that must
 * survive for accounting or unsettled partner obligations are retained but
 * disconnected from the account and stripped of ordinary profile data.
 */
export async function deleteUserAccount(userId: string, client: Client = db()): Promise<void> {
  const tables = await existingTables(client);
  const missingRequired = USER_TABLES.filter((item) => item.required && !tables.has(item.table));
  if (missingRequired.length > 0) {
    throw new Error(`Account deletion schema incomplete: ${missingRequired.map((item) => item.table).join(", ")}`);
  }

  const account = await client.execute({
    sql: "SELECT email FROM auth_users WHERE id = ? LIMIT 1",
    args: [userId],
  });
  const email = account.rows[0]?.email ? String(account.rows[0].email) : null;

  let preserveMarketingObjection = false;
  if (email && tables.has("email_prefs")) {
    const preference = await client.execute({
      sql: "SELECT unsubscribed_at FROM email_prefs WHERE user_id = ? LIMIT 1",
      args: [userId],
    });
    preserveMarketingObjection = Boolean(preference.rows[0]?.unsubscribed_at);
  }

  const partner = tables.has("partners")
    ? await client.execute({ sql: "SELECT 1 FROM partners WHERE user_id = ? LIMIT 1", args: [userId] })
    : null;
  const isPartner = Boolean(partner?.rows.length);
  const anonymousPartnerId = `deleted-partner:${randomUUID()}`;
  const anonymousRefCode = `DELETED-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
  const statements: InStatement[] = [];

  if (preserveMarketingObjection && email) {
    // SHA-256 is a pseudonymous comparison token, not anonymous data. It is
    // retained only to recognise the same address if it is supplied again.
    statements.push(
      SUPPRESSION_SCHEMA,
      {
        sql: "INSERT OR IGNORE INTO email_suppression (email_hash, reason) VALUES (?, ?)",
        args: [emailHash(email), "account-deleted"],
      },
    );
  }

  // A redeemed company code must not continue pointing at a deleted account;
  // it remains consumed so deleting an account cannot make the code reusable.
  if (tables.has("licenses")) {
    statements.push({ sql: "UPDATE licenses SET redeemed_by = NULL WHERE redeemed_by = ?", args: [userId] });
  }

  // Commission rows are accounting records. Keep the transaction, remove the
  // deleted customer's account identifier.
  if (tables.has("commissions")) {
    statements.push({ sql: "UPDATE commissions SET user_id = NULL WHERE user_id = ?", args: [userId] });
  }

  if (isPartner) {
    // Preserve commission and payout continuity under a fresh, unlinkable id.
    // Payout coordinates may still be needed to settle an amount already due;
    // ordinary profile fields and the identifying referral code are removed.
    for (const table of ["partner_clicks", "partner_leads", "commissions", "payouts"]) {
      if (tables.has(table)) {
        statements.push({
          sql: `UPDATE ${table} SET partner_id = ? WHERE partner_id = ?`,
          args: [anonymousPartnerId, userId],
        });
      }
    }
    if (tables.has("partner_attributions")) {
      statements.push({
        sql: "UPDATE partner_attributions SET partner_id = ?, ref_code = ? WHERE partner_id = ?",
        args: [anonymousPartnerId, anonymousRefCode, userId],
      });
    }
    if (tables.has("partner_audit")) {
      statements.push({
        sql: `UPDATE partner_audit
              SET actor = CASE WHEN actor = ? THEN ? ELSE actor END,
                  entity = CASE WHEN entity = ? THEN ? ELSE entity END,
                  detail = CASE WHEN detail IS NULL THEN NULL ELSE replace(detail, ?, ?) END
              WHERE actor = ? OR entity = ? OR instr(COALESCE(detail, ''), ?) > 0`,
        args: [userId, anonymousPartnerId, userId, anonymousPartnerId, userId, anonymousPartnerId, userId, userId, userId],
      });
    }
    statements.push({
      sql: `UPDATE partners
            SET user_id = ?, name = 'Account eliminato', email = NULL,
                country = NULL, status = 'DELETED', ref_code = ?, notes = NULL
            WHERE user_id = ?`,
      args: [anonymousPartnerId, anonymousRefCode, userId],
    });
  }

  for (const item of USER_TABLES) {
    if (!tables.has(item.table)) continue;
    statements.push({ sql: `DELETE FROM ${item.table} WHERE ${item.column} = ?`, args: [userId] });
  }

  // libSQL batches with transaction mode "write" are atomic. Any genuine
  // DELETE/UPDATE failure rejects this promise and rolls the whole batch back.
  await client.batch(statements, "write");
}

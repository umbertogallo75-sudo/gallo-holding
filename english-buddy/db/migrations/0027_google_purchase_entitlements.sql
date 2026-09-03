-- Keep the latest verified state of EACH Play token, not just the plan last
-- written to the user's billing summary. No historical ownership-only row
-- is backfilled as active without a known state and expiry.
CREATE TABLE IF NOT EXISTS google_purchase_entitlements (
  purchase_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled')),
  current_period_end TEXT,
  verified_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_google_entitlements_user
  ON google_purchase_entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_google_entitlements_refresh
  ON google_purchase_entitlements(status, current_period_end);

-- Failed checks also advance the bounded cron queue. This timestamp must not
-- be confused with the CAS timestamp of an authoritative Google response.
CREATE TABLE IF NOT EXISTS google_purchase_refresh_attempts (
  purchase_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  checked_at INTEGER NOT NULL
);

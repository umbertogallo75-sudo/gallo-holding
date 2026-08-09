-- Billing: one row per user, kept in sync by the Stripe webhook.
CREATE TABLE IF NOT EXISTS billing (
  user_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT,
  plan TEXT,
  status TEXT,
  current_period_end TEXT,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_billing_customer ON billing(stripe_customer_id);

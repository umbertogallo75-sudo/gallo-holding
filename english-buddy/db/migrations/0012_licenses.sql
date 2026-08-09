-- Team licenses: prepaid seats bought by companies, redeemed by employees.
CREATE TABLE IF NOT EXISTS licenses (
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

CREATE INDEX IF NOT EXISTS idx_licenses_order ON licenses(order_id);

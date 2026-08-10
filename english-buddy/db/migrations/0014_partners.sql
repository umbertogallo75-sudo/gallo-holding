-- Partner / affiliate commercial system.
CREATE TABLE IF NOT EXISTS partners (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  country TEXT,
  partner_type TEXT NOT NULL DEFAULT 'AFFILIATE',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  ref_code TEXT NOT NULL UNIQUE,
  commission_rate REAL NOT NULL DEFAULT 5,
  terms_version TEXT,
  terms_accepted_at TEXT,
  payout_method TEXT,
  payout_details TEXT,
  payout_docs_status TEXT NOT NULL DEFAULT 'missing',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS partner_clicks (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  campaign TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_pclicks_partner ON partner_clicks(partner_id, created_at);

CREATE TABLE IF NOT EXISTS partner_attributions (
  user_id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  ref_code TEXT,
  campaign TEXT,
  source TEXT NOT NULL DEFAULT 'link',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_pattr_partner ON partner_attributions(partner_id);

CREATE TABLE IF NOT EXISTS partner_leads (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  source TEXT NOT NULL DEFAULT 'OTHER',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  protected_until TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_pleads_partner ON partner_leads(partner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pleads_email ON partner_leads(email);

CREATE TABLE IF NOT EXISTS commissions (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  user_id TEXT,
  payment_ref TEXT NOT NULL UNIQUE,
  payment_intent TEXT,
  plan TEXT,
  revenue_cents INTEGER NOT NULL,
  net_cents INTEGER NOT NULL,
  rate REAL NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  status TEXT NOT NULL DEFAULT 'pending',
  earned_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  available_at TEXT,
  paid_at TEXT,
  reversed_at TEXT,
  reversal_reason TEXT,
  payout_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_comm_partner ON commissions(partner_id, status);
CREATE INDEX IF NOT EXISTS idx_comm_intent ON commissions(payment_intent);

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  reference TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS partner_audit (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

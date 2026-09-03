-- A store transaction belongs to exactly one ExecLingo account. This prevents
-- a Play purchase token or Apple original transaction from being replayed on
-- a different account, even if the user's current billing summary later
-- changes provider.
CREATE TABLE IF NOT EXISTS store_purchase_owners (
  provider TEXT NOT NULL,
  purchase_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (provider, purchase_key)
);

CREATE INDEX IF NOT EXISTS idx_store_purchase_owner_user
  ON store_purchase_owners(user_id);

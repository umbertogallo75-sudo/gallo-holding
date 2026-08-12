-- Native iOS push: APNs device tokens registered by the store-app wrapper.
CREATE TABLE IF NOT EXISTS apns_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  timezone TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  last_seen TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_apns_tokens_user ON apns_tokens(user_id);

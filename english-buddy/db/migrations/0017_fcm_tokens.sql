-- Native Android push: Firebase Cloud Messaging device tokens.
CREATE TABLE IF NOT EXISTS fcm_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  timezone TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  last_seen TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user ON fcm_tokens(user_id);

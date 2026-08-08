-- Multi-user support: account records for invite-based registration.
-- Access codes are stored as a keyed HMAC (never plaintext). The original
-- owner keeps authenticating via APP_ACCESS_CODE and is not stored here.

CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  code_hmac TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

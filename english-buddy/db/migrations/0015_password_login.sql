-- Email+password login: the password is verified inside the account that
-- owns the email, so it no longer needs to be globally unique. SQLite cannot
-- drop a column-level UNIQUE autoindex, so the table is rebuilt.
CREATE TABLE IF NOT EXISTS auth_users_v2 (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  code_hmac TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  email TEXT,
  reset_hmac TEXT,
  reset_expires_at TEXT,
  google_sub TEXT,
  apple_sub TEXT
);
INSERT OR IGNORE INTO auth_users_v2 (id, display_name, code_hmac, created_at, email, reset_hmac, reset_expires_at, google_sub, apple_sub)
  SELECT id, display_name, code_hmac, created_at, email, reset_hmac, reset_expires_at, google_sub, apple_sub FROM auth_users;
DROP TABLE auth_users;
ALTER TABLE auth_users_v2 RENAME TO auth_users;
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_google_sub ON auth_users(google_sub) WHERE google_sub IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_apple_sub ON auth_users(apple_sub) WHERE apple_sub IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_users_email_lower ON auth_users(lower(email));

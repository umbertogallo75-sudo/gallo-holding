-- Social sign-in (Google / Apple): provider subject ids linked to accounts.
-- Additive only; OAuth-created accounts store a random unusable code_hmac.

ALTER TABLE auth_users ADD COLUMN google_sub TEXT;
ALTER TABLE auth_users ADD COLUMN apple_sub TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_google_sub ON auth_users(google_sub) WHERE google_sub IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_apple_sub ON auth_users(apple_sub) WHERE apple_sub IS NOT NULL;

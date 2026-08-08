-- Access-code recovery: short-lived reset tokens (email flow) stored as
-- HMACs on the account row. Additive only.

ALTER TABLE auth_users ADD COLUMN reset_hmac TEXT;
ALTER TABLE auth_users ADD COLUMN reset_expires_at TEXT;

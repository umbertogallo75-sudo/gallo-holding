-- Email collected at registration, shown in the owner dashboard for
-- direct contact. Additive only.

ALTER TABLE auth_users ADD COLUMN email TEXT;

-- The objection has to outlive the account.
--
-- Deleting a user removes email_prefs with everything else, which is correct:
-- it is their data. But it also removes the only record that they asked never
-- to be written to again — so the same address, arriving again, would be
-- written to as if nothing had happened. Honouring an objection is not
-- optional, and it cannot depend on a row we are obliged to delete.
--
-- Only the SHA-256 of the lowercased address is kept. It is not the address in
-- clear and cannot send a message by itself, but it can be tested against an
-- address already known to the system. It is therefore pseudonymous personal
-- data, not anonymous or inherently impossible to re-identify.
CREATE TABLE IF NOT EXISTS email_suppression (
  email_hash TEXT PRIMARY KEY,
  added_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  reason TEXT
);

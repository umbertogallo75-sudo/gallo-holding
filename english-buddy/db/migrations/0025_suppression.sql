-- The objection has to outlive the account.
--
-- Deleting a user removes email_prefs with everything else, which is correct:
-- it is their data. But it also removes the only record that they asked never
-- to be written to again — so the same address, arriving again, would be
-- written to as if nothing had happened. Honouring an objection is not
-- optional, and it cannot depend on a row we are obliged to delete.
--
-- Only the SHA-256 of the lowercased address is kept. That is enough to
-- recognise the address if it comes back, and not enough to write to it or to
-- read who it belonged to.
CREATE TABLE IF NOT EXISTS email_suppression (
  email_hash TEXT PRIMARY KEY,
  added_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  reason TEXT
);

-- Proof that consent was actually given.
--
-- Article 7 of the GDPR puts the burden on us: it is not enough to have asked
-- politely, we have to be able to demonstrate the answer. A cookie on the
-- visitor's own device cannot do that — they can clear it, and it proves
-- nothing about what was on screen at the time.
--
-- Deliberately minimal. No IP address, no user agent, no fingerprint: the
-- receipt id lives in the visitor's cookie, so their device holds the key to
-- their own row, and a signed-in choice carries the user id, which is the
-- strongest link there is. A log kept to defend privacy should not become the
-- most revealing table in the database.
CREATE TABLE IF NOT EXISTS consent_log (
  id TEXT PRIMARY KEY,
  choice TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  -- Which third parties were on the page when the question was asked. Without
  -- this the record proves consent to an unknown list.
  tags TEXT,
  user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_consent_log_time ON consent_log(created_at);
CREATE INDEX IF NOT EXISTS idx_consent_log_user ON consent_log(user_id);

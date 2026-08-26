-- Lifecycle and marketing email.
--
-- Three tables, one job each: who has asked to be left alone, what has
-- already been sent, and who is inside the free trial the welcome email
-- hands out.

-- A row appears the first time someone expresses a choice. No row means
-- "never said anything", which counts as subscribed.
CREATE TABLE IF NOT EXISTS email_prefs (
  user_id TEXT PRIMARY KEY,
  unsubscribed_at TEXT,
  source TEXT,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Every lifecycle email, claimed by primary key *before* it is sent, so two
-- overlapping cron runs cannot send the same person the same email twice.
-- The claim key carries the day for the emails that may repeat.
CREATE TABLE IF NOT EXISTS email_sends (
  claim_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_email_sends_user ON email_sends(user_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_email_sends_kind ON email_sends(kind, sent_at);

-- 24 hours on the first click, another 24 once the path is actually walked.
-- Separate from `billing` on purpose: nothing here is a Stripe object, and
-- the paywall should keep working untouched if this table is empty.
CREATE TABLE IF NOT EXISTS trials (
  user_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  ends_at TEXT NOT NULL,
  extended_at TEXT
);

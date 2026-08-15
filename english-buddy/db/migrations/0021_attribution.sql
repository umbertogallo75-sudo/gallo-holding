-- First-touch acquisition source, frozen on the user at registration.
--
-- Attribution has to be stored on the user, not looked up at purchase time:
-- the Stripe webhook is a server-to-server call with no browser, no cookie
-- and no localStorage, so by the time somebody pays there is nothing left to
-- read. One row per user, written once — first touch wins, because a
-- considered purchase is credited to whatever brought the person in, not to
-- the last link they happened to click.
CREATE TABLE IF NOT EXISTS user_attribution (
  user_id TEXT PRIMARY KEY,
  visitor_id TEXT,
  source TEXT NOT NULL DEFAULT 'direct',
  medium TEXT,
  campaign TEXT,
  referrer TEXT,
  landed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_user_attribution_source ON user_attribution(source);
CREATE INDEX IF NOT EXISTS idx_user_attribution_visitor ON user_attribution(visitor_id);

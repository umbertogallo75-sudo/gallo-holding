-- Known AI model ids per provider; the daily cron emails the owner when a
-- new one appears.
CREATE TABLE IF NOT EXISTS model_watch (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  first_seen TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

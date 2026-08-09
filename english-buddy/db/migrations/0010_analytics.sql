-- Funnel analytics: first-party, anonymous events. No external trackers —
-- ad-click → landing → register → onboarding is measurable from our own DB.
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  visitor_id TEXT,
  user_id TEXT,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_analytics_name_time ON analytics_events(name, created_at);

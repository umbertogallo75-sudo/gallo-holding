-- The meetings, calls and trips the user is actually preparing for. The whole
-- point of the app's daily practice is one of these: knowing them is what
-- lets Sam prepare somebody for Thursday instead of for a syllabus.
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- What the user wrote, in their own words.
  title TEXT NOT NULL,
  -- Local date (YYYY-MM-DD) and optional time (HH:MM) of the event.
  event_date TEXT NOT NULL,
  event_time TEXT,
  -- The prepared material, as JSON: phrases, likely questions, strategy.
  prep_json TEXT,
  -- When the "it's tomorrow" push went out, so it goes out once.
  reminded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_events_upcoming ON events(user_id, event_date);

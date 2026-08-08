-- Start-from-Zero pathway + 3-month capability tracking.
-- Backward compatible: only additive columns and a new table.

ALTER TABLE profiles ADD COLUMN starting_level TEXT;          -- zero | basics | independent | business
ALTER TABLE profiles ADD COLUMN translation_support INTEGER NOT NULL DEFAULT 1;
ALTER TABLE profiles ADD COLUMN path_started_at TEXT;         -- start of the ~3-month progression

CREATE TABLE IF NOT EXISTS user_capabilities (
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  achieved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, capability)
);

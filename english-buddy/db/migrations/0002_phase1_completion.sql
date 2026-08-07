-- Phase 1 completion: richer profile preferences, mistake review scheduling,
-- session summaries. Spaced repetition is embedded on the reviewable rows
-- (expressions, mistakes) instead of a generic reviews table — see docs/DATABASE.md.

ALTER TABLE profiles ADD COLUMN native_language TEXT NOT NULL DEFAULT 'Italian';
ALTER TABLE profiles ADD COLUMN professional_context TEXT;
ALTER TABLE profiles ADD COLUMN learning_goals TEXT;
ALTER TABLE profiles ADD COLUMN notification_intensity TEXT NOT NULL DEFAULT 'immersive';
ALTER TABLE profiles ADD COLUMN quiet_hours_start INTEGER NOT NULL DEFAULT 22;
ALTER TABLE profiles ADD COLUMN quiet_hours_end INTEGER NOT NULL DEFAULT 7;
ALTER TABLE profiles ADD COLUMN updated_at TEXT;

ALTER TABLE mistakes ADD COLUMN severity TEXT NOT NULL DEFAULT 'minor';
ALTER TABLE mistakes ADD COLUMN first_seen_at TEXT;
ALTER TABLE mistakes ADD COLUMN mastered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mistakes ADD COLUMN next_review_at TEXT;
ALTER TABLE mistakes ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mistakes ADD COLUMN success_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mistakes ADD COLUMN interval_days REAL NOT NULL DEFAULT 1.0;
CREATE INDEX IF NOT EXISTS idx_mistakes_due ON mistakes(user_id, mastered, next_review_at);

ALTER TABLE expressions ADD COLUMN interval_days REAL NOT NULL DEFAULT 1.0;
ALTER TABLE expressions ADD COLUMN mastered INTEGER NOT NULL DEFAULT 0;

ALTER TABLE sessions ADD COLUMN topic TEXT;
ALTER TABLE sessions ADD COLUMN summary TEXT;

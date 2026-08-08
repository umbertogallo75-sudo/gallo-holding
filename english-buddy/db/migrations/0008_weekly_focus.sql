-- Weekly focus (Phase 5+): one recurring-error pattern per week that the
-- coach steers all conversations toward. Additive only.

ALTER TABLE profiles ADD COLUMN weekly_focus TEXT;
ALTER TABLE profiles ADD COLUMN weekly_focus_set_at TEXT;

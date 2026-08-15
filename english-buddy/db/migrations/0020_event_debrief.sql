-- What the appointment actually taught. The gaps someone hits in a real
-- meeting are the only syllabus worth having, so the debrief is stored on the
-- event and its phrases join the same spaced repetition as everything else.
ALTER TABLE events ADD COLUMN debrief_json TEXT;
-- When the "how did it go?" push went out, so it goes out once.
ALTER TABLE events ADD COLUMN debrief_asked_at TEXT;

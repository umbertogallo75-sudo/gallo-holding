-- A session you finished, told apart from one you walked away from.
--
-- ended_at was already there and means "last activity", bumped on every coach
-- turn. It cannot say whether somebody is coming back — which is exactly the
-- question resuming has to answer. closed_at is set only when a session is
-- deliberately finished: by the learner, or by the conversation running its
-- course. Anything recent without it is waiting to be picked up again.
ALTER TABLE sessions ADD COLUMN closed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_open ON sessions(user_id, closed_at, started_at DESC);

-- The three questions the app asks before the first session, and the mark that
-- says they were asked.
--
-- daily_minutes is the answer to "quanto tempo hai al giorno": it decides which
-- session gets proposed, so it has to be a real column rather than something
-- inferred from behaviour that has not happened yet.
--
-- onboarding_done_at separates "answered the questions" from "has a profile".
-- Everyone who registered before these questions existed has a profile and no
-- answers, and they are exactly the people who should be offered them once.
ALTER TABLE profiles ADD COLUMN daily_minutes INTEGER NOT NULL DEFAULT 5;
ALTER TABLE profiles ADD COLUMN onboarding_done_at TEXT;

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT 'Friend',
  timezone TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS learning_state (
  user_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  cefr_level TEXT NOT NULL DEFAULT 'A2',
  primary_goal TEXT NOT NULL DEFAULT 'Business calls and meetings',
  listening INTEGER NOT NULL DEFAULT 50,
  speaking INTEGER NOT NULL DEFAULT 50,
  business_conversation INTEGER NOT NULL DEFAULT 50,
  vocabulary INTEGER NOT NULL DEFAULT 50,
  grammar INTEGER NOT NULL DEFAULT 50,
  pronunciation INTEGER NOT NULL DEFAULT 50,
  fluency INTEGER NOT NULL DEFAULT 50,
  comprehension INTEGER NOT NULL DEFAULT 50,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_started ON sessions(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  correction TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mistakes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  incorrect TEXT NOT NULL,
  correct TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  note TEXT,
  times_seen INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, incorrect, correct)
);
CREATE INDEX IF NOT EXISTS idx_mistakes_user_seen ON mistakes(user_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS expressions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expression TEXT NOT NULL,
  meaning TEXT,
  next_review_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  review_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 1.0,
  last_reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, expression)
);
CREATE INDEX IF NOT EXISTS idx_expressions_due ON expressions(user_id, next_review_at);

CREATE TABLE IF NOT EXISTS daily_metrics (
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  minutes_practiced INTEGER NOT NULL DEFAULT 0,
  interactions INTEGER NOT NULL DEFAULT 0,
  expressions_reviewed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, day)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  subscription_json TEXT NOT NULL,
  timezone TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  prompt TEXT,
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  opened_at TEXT
);

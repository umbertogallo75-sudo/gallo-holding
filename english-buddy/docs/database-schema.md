# Database schema

The Turso/libSQL schema lives in `db/migrations/0001_phase1_turso.sql`.

Core tables: profiles, learning_state, sessions, messages, mistakes, expressions, daily_metrics.

Future-ready tables: push_subscriptions and notification_history.

The schema is relational even though the first MVP has one owner. This keeps the learning memory portable to a future multi-user version.

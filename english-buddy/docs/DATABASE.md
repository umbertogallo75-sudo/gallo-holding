# Database

Turso / libSQL. Migrations live in `db/migrations/*.sql` and are applied in filename order by `npm run db:migrate`, which records applied files in `schema_migrations` (safe to re-run).

For local development or tests you can use a file database — no Turso account needed:

```
TURSO_DATABASE_URL=file:local.db npm run db:migrate
```

## Tables

| Table | Purpose |
| --- | --- |
| `profiles` | Display name, timezone, native language, professional context, learning goals (JSON), notification intensity, quiet hours |
| `learning_state` | Adaptive skill estimates (0–100) per dimension + CEFR guess + primary goal. Estimates, not certified scores. |
| `sessions` | One row per learning session: mode, started/ended, topic, summary. `ended_at` is bumped on every coach turn. |
| `messages` | Conversation turns per session (role, content, optional correction). Only the last 12 of the current session feed the model. |
| `mistakes` | Recurring mistakes: incorrect/correct pair, category, severity, occurrences, first/last seen, review scheduling, mastered flag |
| `expressions` | Useful expressions with meaning + review scheduling + mastered flag |
| `daily_metrics` | Per-day minutes practiced, interactions, expressions reviewed |
| `push_subscriptions` | Web Push endpoints (Phase 2) |
| `notification_history` | Sent notifications + open tracking (Phase 2) |
| `schema_migrations` | Migration bookkeeping |

## Spaced repetition design

There is no generic `reviews` table: review scheduling is embedded directly on the reviewable rows (`expressions` and `mistakes` both carry `next_review_at`, `interval_days`, `review_count`, `success_count`, `mastered`). Both share one curve (`lib/learning/spaced-repetition.ts`): interval ×2.2 on success (capped at 60 days), reset to 1 day on failure; mastery at ≥4 successes with a ≥21-day interval. A repeated mistake is automatically un-mastered and pulled forward.

Reviews happen **inside conversations**: due items are injected into the coach prompt, the model weaves them in naturally and reports outcomes via `reviewed_items`, and `recordReviewResult` updates the schedule. No flashcard grind.

## Multi-user readiness

Every user-owned table is keyed by `user_id` with `ON DELETE CASCADE` from `profiles`, so per-user deletion ("delete my data") and multi-user expansion require no schema changes.

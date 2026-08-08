-- Phase 2: fast dedupe lookups for the notification scheduler.
-- kind embeds window + local date (e.g. "buddy:lunch:2026-08-08").

CREATE INDEX IF NOT EXISTS idx_notification_history_user_sent ON notification_history(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_history_user_kind ON notification_history(user_id, kind);

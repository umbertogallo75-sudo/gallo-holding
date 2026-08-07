# Notifications (Phase 2 — designed, not yet implemented)

## What already exists

- `push_subscriptions` table (multi-device ready) and `notification_history` (sent/opened tracking for later timing optimization)
- `profiles.notification_intensity` (`low` / `normal` / `immersive`, chosen in onboarding; the initial user defaults to immersive) and `profiles.quiet_hours_start/end` + timezone
- Service worker registered from first load (`public/sw.js`)
- `.env.example` placeholders for VAPID keys

## Planned implementation

1. Generate VAPID keys: `npx web-push generate-vapid-keys`; set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
2. Client: subscribe after an explicit user action (never on first render), POST subscription to `/api/push/subscribe`.
3. `sw.js`: `push` handler shows the notification; `notificationclick` deep-links (e.g. `/buddy?mode=buddy`).
4. Scheduler: a Vercel Cron route runs hourly, checks each user's timezone, quiet hours, intensity, and today's `notification_history`, and generates a natural Buddy question (never "Time to study English!"). Windows: morning, late morning, lunch, mid-afternoon, late afternoon, evening.
5. Log every send in `notification_history`; mark `opened_at` from the click handler for future timing personalization.

## Philosophy

Many gentle touchpoints, like a friend texting. No streaks, no guilt, no punishment for ignoring a question. Intensity is user-controlled.

iOS requirement: Web Push works only for PWAs added to the Home Screen (iOS 16.4+), so the install flow comes first.

# Notifications (Phase 2 — implemented)

English Buddy texts users like a friend: short, natural English questions at
natural moments of the day. No streaks, no guilt; ignoring a question has no
consequence.

## How it works

1. **Subscription** — the Home screen shows an "Enable notifications" card
   (after an explicit tap, never on first render). The client subscribes via
   the service worker and POSTs the subscription + timezone to
   `/api/push/subscribe`. Multiple devices per user are supported; dead
   subscriptions are cleaned automatically on send failures (404/410).
2. **Scheduler** — `/api/cron/notifications` (Bearer `CRON_SECRET`) runs
   hourly via GitHub Actions (`.github/workflows/notifications.yml`), with a
   daily Vercel cron (`vercel.json`) as backup — Vercel's Hobby plan only
   allows daily crons. For each subscribed user it applies, in their timezone:
   - **Windows**: morning 8-10 · late morning 10-12 · lunch 12-14 ·
     afternoon 14-16 · late afternoon 16-18 · evening 18-21
   - **Intensity** (from onboarding): `immersive` = all six windows,
     `normal` = morning/lunch/evening, `low` = evening only
   - **Quiet hours** per profile (default 22 → 7, may wrap midnight)
   - **Dedupe**: max one notification per window per local day
     (`notification_history.kind` = `buddy:<window>:<local date>`)
3. **Content** — a tiny LLM call generates one fresh question (≤22 words),
   personalized by name/level/professional context and avoiding recent
   questions; on any upstream failure a curated pool provides the fallback.
4. **Delivery & deep link** — the service worker shows the notification;
   tapping it opens `/buddy?mode=buddy&q=<question>` where the question
   appears instantly as the Buddy's message (no extra model call) and the
   reply flows into the normal coach loop. The click also marks
   `notification_history.opened_at` for future timing personalization.

The scheduling core is pure and unit-tested (`src/lib/push/windows.ts`,
`tests/push-windows.test.ts`).

## iOS requirements

Web Push on iOS (16.4+) works only for PWAs added to the Home Screen. The
Enable card detects a non-installed iOS browser and shows install guidance
instead of a broken permission prompt.

## Environment variables

`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
`CRON_SECRET` — see docs/DEPLOYMENT.md.

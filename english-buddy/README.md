# English Buddy — Turso Edition

A mobile-first PWA for frequent, adaptive English practice: short written sessions now, with push notifications, Listen + Type and realtime voice planned next.

## Why Turso

Phase 1 no longer depends on Supabase. The app uses Turso/libSQL for structured learning memory and a private server-side access code for the initial single-user MVP.

## Stack

- Next.js 16 + React 19 + TypeScript
- Turso / libSQL
- OpenAI Responses API
- PWA manifest + service worker
- Private access-code authentication using an HttpOnly signed session cookie
- Vercel-ready

## Setup

1. Create a free Turso database.
2. Run `db/migrations/0001_phase1_turso.sql` against it.
3. Copy `.env.example` to `.env.local`.
4. Fill in:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `APP_ACCESS_CODE`
   - `SESSION_SECRET` (32+ random characters)
   - `OPENAI_API_KEY`
5. Install dependencies with `npm install`.
6. Run `npm run dev`.
7. Open the app, enter the private access code, complete the 60-second onboarding, and begin a text session.

## Current Phase 1

- PWA shell
- Private single-user login
- 2-minute and 5-minute written sessions
- Guided Business English session
- Adaptive coach using recent mistakes + due expressions
- Structured learning memory
- Spaced-repetition-ready expression records
- Practical progress dashboard
- Daily activity metrics
- Database tables already reserved for push subscriptions and notification history

## Next

Phase 2: Web Push + notification scheduler and deep-linked English Buddy prompts.

Phase 3: Listen + Type.

Phase 4: OpenAI Realtime voice.

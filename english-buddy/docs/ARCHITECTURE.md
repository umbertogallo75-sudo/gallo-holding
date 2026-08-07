# Architecture

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript, Tailwind CSS v4 on top of a small custom design system in `globals.css`
- **Turso / libSQL** for all persistence (no Supabase — deliberately removed)
- **OpenAI Responses API** (`gpt-5-mini` by default) with strict structured outputs
- **PWA**: manifest + service worker (app shell caching), iPhone-first
- Deploy target: **Vercel** (repo root directory: `english-buddy`)

## Layout

```
src/
  proxy.ts              Next 16 middleware: auth gate (cookie presence + API 401s)
  app/                  Routes (login, onboarding, home, buddy, progress) + API routes
  components/           Small presentational client components
  lib/
    auth.ts             Signed, expiring session token (HMAC of SESSION_SECRET)
    db.ts               libSQL client singleton
    rate-limit.ts       In-memory fixed-window limiter
    ai/                 Prompt builder, OpenAI call, Zod + JSON schemas
    learning/           Learning-memory service layer + spaced repetition
db/migrations/          Ordered .sql files, applied by scripts/migrate.mjs
scripts/migrate.mjs     Idempotent migration runner (schema_migrations table)
tests/                  Vitest: auth, schema parsing, spaced repetition, service layer on a real file DB
```

## Key decisions

- **Learning memory, not chat history.** Each coach turn builds a compact context (`getRelevantLearningContext`): profile, level, recent/due mistakes, due expressions, last 12 session messages, today's metrics. Full history is never replayed into the model.
- **Service layer owns persistence.** API routes call `src/lib/learning/service.ts`; no SQL in components. Every service function accepts an optional libSQL client so tests run against a local `file:` database.
- **Structured outputs.** The coach model must return the `coach_turn` JSON schema (strict mode). Zod re-validates on our side and degrades gracefully (a malformed turn still yields a plain reply).
- **Single-user auth designed for replacement.** All user data is keyed by `user_id` (currently the constant `owner`). Swapping in multi-user auth later means replacing `lib/auth.ts` — the learning engine does not change.
- **Sessions self-close.** Each coach turn bumps `sessions.ended_at`, so duration is derivable without client-side beacons.

## Phase status

- Phase 1 (foundation, text modes, learning memory, PWA shell): **done**
- Phase 2 (Web Push scheduler): schema is ready (`push_subscriptions`, `notification_history`, profile intensity/quiet hours); implementation next
- Phase 3 (Listen + Type) and Phase 4 (Realtime voice): not started; modes are visible but disabled in the UI

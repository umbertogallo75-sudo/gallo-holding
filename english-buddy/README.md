# English Buddy

A personal AI English coach, built as an iPhone-first PWA. Not a course, not gamified: English enters the day through many small interactions — 2 minutes counts, and the app adapts to whatever the user can do right now (type, listen, or talk).

Primary goal: functional, confident **professional English** — meetings, finance, M&A, negotiation, leadership — plus normal conversation.

## Stack

- Next.js 16 · React 19 · TypeScript · Tailwind CSS v4
- Turso / libSQL (structured learning memory — **no Supabase**)
- OpenAI Responses API with strict structured outputs
- Multi-user auth: self-registration + personal access codes (optional `INVITE_CODE` lock) → HMAC-signed expiring HttpOnly cookie
- PWA (manifest, service worker, dark/light mode), Vercel-ready

## Quick start

```bash
cd english-buddy
npm install
cp .env.example .env.local     # fill in the values (see docs/DEPLOYMENT.md)

# Local dev can use a file database instead of Turso:
#   TURSO_DATABASE_URL=file:local.db
npm run db:migrate
npm run dev
```

Open http://localhost:3000, enter your `APP_ACCESS_CODE`, complete the 60-second onboarding, start a session.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest — auth, coach schema, spaced repetition, learning service on a real libSQL file DB |
| `npm run db:migrate` | Apply `db/migrations/*.sql` (idempotent) |

## What works today

- **Start from Zero**: level selection at onboarding (zero / a little / manage / business), a guided beginner path (listen → read → repeat → complete → use) with Italian scaffolding that fades as competence grows — while keeping the 3-month business-English mission
- **3-month capability path**: month 1 foundations → month 2 workplace → month 3 managerial English; real-world capabilities ("can introduce yourself", "can present numbers"…) tracked on the Progress screen
- **English Rescue** (`/rescue`): type Italian, get the sentence in English in three registers (simple / natural / business) with audio, copy, save-for-review and practice
- **"I don't know what to say"**: in any conversation, get 2-3 level-appropriate example answers to choose and edit
- **Real-life missions**: role-play scenes (introduce yourself, airport, hotel, restaurant, meetings, calls, numbers, scheduling) that mark capabilities when completed
- **Owner dashboard** (`/admin`): who uses the app, minutes, last activity, capability count; send nudge notifications and tune per-user notification intensity
- Listen buttons (normal + slow speed) on coach messages via device speech synthesis

### Phase 1 foundation

- Self-registration at `/register` with per-user access codes (lockable via `INVITE_CODE`); each user's learning data is fully separate
- Short onboarding (goals, level incl. "I don't know", professional context, notification intensity)
- Home: "What can you do right now?" — 2 min, 5 min, 20-min guided, Buddy question, Surprise me
- Adaptive text coach with learning memory: recurring mistakes, useful expressions, natural spaced repetition woven into conversation, gradual skill estimates
- Progress screen (practical ability estimates, recent fixes, new expressions), daily metrics
- PWA shell with offline fallback, dark/light mode, iPhone icons

## Roadmap

All six phases shipped: Phase 2 Web Push Buddy notifications · Phase 3 Listen + Type dictation · Phase 4 realtime voice (WebRTC + gpt-realtime-mini, 10-min capped) · Phase 5 deep adaptation (automatic CEFR progression from skill evidence, auto-fading Italian support, performance-signal difficulty calibration, spaced-repetition woven into push notifications) · Phase 6 polish (offline shell v3, branded 404, tactile UI). Next ideas: richer accent/listening stages, weekly email digest.

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure and key decisions
- [docs/DATABASE.md](docs/DATABASE.md) — schema, migrations, spaced repetition
- [docs/AI_COACH.md](docs/AI_COACH.md) — model usage, turn contract, cost control
- [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md) — Phase 2 design
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Turso + Vercel setup, env vars, iPhone install

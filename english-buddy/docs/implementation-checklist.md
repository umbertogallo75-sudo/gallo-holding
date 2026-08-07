# Implementation checklist

## Phase 1 — done in code
- [x] Mobile-first PWA shell
- [x] Turso/libSQL database layer
- [x] Private access-code authentication with signed HttpOnly session cookie
- [x] Onboarding
- [x] 2-minute and 5-minute text sessions
- [x] Guided Business English mode
- [x] Adaptive coach context from learning memory
- [x] Store recurring mistakes
- [x] Store useful expressions
- [x] Skill-score updates
- [x] Daily activity metrics
- [x] Progress dashboard
- [x] Tables reserved for push subscriptions and notification history

## Deployment validation
- [ ] Create real Turso database
- [ ] Apply `db/migrations/0001_phase1_turso.sql`
- [ ] Add Vercel environment variables
- [ ] Run `npm install`, `npm run typecheck`, `npm run build`
- [ ] Test login + onboarding + first coach session on iPhone

## Phase 2
- [ ] Web Push subscription UI
- [ ] VAPID keys
- [ ] Notification scheduler
- [ ] Deep-linked English Buddy prompts
- [ ] Quiet hours + timezone-aware delivery

## Phase 3
- [ ] Listen + Type with TTS

## Phase 4
- [ ] Realtime voice via WebRTC

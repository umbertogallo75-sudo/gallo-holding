# Architecture

## Current

Client: Next.js PWA on Vercel.

Server: Next.js route handlers keep credentials private and call OpenAI + Turso.

Database: Turso/libSQL stores only learning-related state: profile, skill estimates, sessions, messages, recurring mistakes, expressions and daily metrics.

Authentication: the first MVP is private/single-user. A private access code is checked only server-side; a signed HttpOnly cookie identifies the owner. This intentionally avoids a paid authentication dependency. Multi-user authentication can replace this layer later without changing the learning schema.

AI memory: the coach receives a bounded context assembled from the database: current level/goal, recent mistakes, due expressions and recent messages. The full history is not injected on every turn.

Planned: Web Push uses push_subscriptions + notification_history. Listen + Type adds TTS. Realtime voice adds a secure ephemeral-token/WebRTC path.

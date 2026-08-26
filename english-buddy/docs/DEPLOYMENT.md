# Deployment

Target: **Vercel** + **Turso**. The app lives in the `english-buddy/` subdirectory of the repository.

## 1. Turso setup (once)

```bash
# Install the CLI (macOS/Linux)
curl -sSfL https://get.tur.so/install.sh | bash

turso auth signup            # or: turso auth login
turso db create english-buddy
turso db show english-buddy --url          # → TURSO_DATABASE_URL
turso db tokens create english-buddy       # → TURSO_AUTH_TOKEN
```

## 2. Run migrations

From `english-buddy/` with the two variables set (or in `.env.local`):

```bash
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:migrate
```

Re-running is safe; applied files are tracked in `schema_migrations`.

## 3. Vercel setup

1. Import the GitHub repository at vercel.com/new.
2. **Set “Root Directory” to `english-buddy`** (the repo root is a separate static site).
3. Framework preset: Next.js (auto-detected).
4. Add the environment variables below (Production + Preview).
5. Deploy. Redeploys happen automatically on every push to the production branch.

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | yes | `libsql://…turso.io` (or `file:local.db` locally) |
| `TURSO_AUTH_TOKEN` | yes (remote DB) | From `turso db tokens create` |
| `APP_ACCESS_CODE` | yes | The owner's private login code — long and unguessable |
| `INVITE_CODE` | no | Optional lock: when set, `/register` requires this invite code; unset = open self-registration |
| `SESSION_SECRET` | yes | 32+ random chars, e.g. `openssl rand -hex 32` |
| `OPENAI_API_KEY` | yes | Server-side only |
| `EMAIL_FROM` | yes (email) | Address on a **verified** domain, e.g. `Sam di ExecLingo <sam@execlingo.it>`. Unset falls back to the provider sandbox and lands in spam |
| `EMAIL_REPLY_TO` | no | Where replies from readers arrive; unset means they are lost |
| `OPENAI_MODEL` | no | Defaults to `gpt-5.6-sol` |
| `VOICE_MODEL` | no | Realtime voice; defaults to `gpt-realtime-2.1` |
| `VOICE_TRANSCRIBE_MODEL` | no | Transcription inside a voice call; defaults to `gpt-transcribe` |
| `OPENAI_TTS_MODEL` | no | Listen buttons; defaults to `gpt-4o-mini-tts` |
| `SAM_TTS_VOICE` | no | Defaults to `cedar`, the same voice as the realtime call |
| `NEXT_PUBLIC_APP_URL` | no | Public URL of the deployment |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | yes (push) | `npx web-push generate-vapid-keys` |
| `CRON_SECRET` | yes (push) | Bearer token protecting `/api/cron/notifications` (used by GitHub Actions + Vercel cron) |

Never commit secrets; `.env*` is gitignored.

## 4. Install on iPhone

1. Open the deployed URL in **Safari**.
2. Share → **Add to Home Screen**.
3. Open the installed app (standalone, dark/light aware).
4. Notifications (Phase 2) will only work from the installed app on iOS.

## Debugging

- Vercel → Project → Logs shows server errors from API routes (secrets are never logged).
- `npm run build && npm start` reproduces the production build locally.
- DB inspection: `turso db shell english-buddy`.

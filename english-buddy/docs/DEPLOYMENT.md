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
| `LIFECYCLE_START_AT` | no | `YYYY-MM-DD`; defaults to `2026-09-15`. Nothing automatic goes out before it, and silence is counted from it |
| `OPENAI_MODEL` | no | Defaults to `gpt-5.6-sol` |
| `VOICE_MODEL` | no | Realtime voice; defaults to `gpt-realtime-2.1` |
| `VOICE_TRANSCRIBE_MODEL` | no | Transcription inside a voice call; defaults to `gpt-transcribe` |
| `OPENAI_TTS_MODEL` | no | Listen buttons; defaults to `gpt-4o-mini-tts` |
| `SAM_TTS_VOICE` | no | Defaults to `cedar`, the same voice as the realtime call |
| `NEXT_PUBLIC_APP_URL` | no | Public URL of the deployment |
| `APP_BASE_URL` | yes (production redirects) | Canonical origin, `https://www.execlingo.it`; used by the smart `/app` fallback and transactional links |
| `APP_STORE_URL` | yes when iOS is public | Set only after the App Store listing opens without a tester login |
| `PLAY_STORE_URL` | yes when Android is public | Cutover switch: set only to `https://play.google.com/store/apps/details?id=it.execlingo.app` after the listing opens publicly. Invalid hosts/packages fail closed; approved UTM/click IDs are carried in Play Install Referrer |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | no | Optional GA4 web-stream override. Scope the production ID to **Production** only; when unset, the checked-in ExecLingo fallback runs only on `execlingo.it`, never on localhost or Vercel Preview |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | yes (push) | `npx web-push generate-vapid-keys` |
| `APPSTORE_IAP_ISSUER_ID` / `APPSTORE_IAP_KEY_ID` / `APPSTORE_IAP_PRIVATE_KEY` | yes (Apple IAP) | Dedicated In-App Purchase key for App Store Server API; paste the complete `.p8` PEM only into the Vercel secret store |
| `APPSTORE_IAP_BUNDLE_ID` | no | Defaults to `it.execlingo.app`; legacy `APPSTORE_BUNDLE_ID` remains supported |
| `APPSTORE_IAP_UI` | yes for iOS checkout | Keep `off` until every Apple product is approved and a sandbox purchase succeeds; then set `on` in Production |
| `APPSTORE_REPORTING_ISSUER_ID` / `APPSTORE_REPORTING_KEY_ID` / `APPSTORE_REPORTING_PRIVATE_KEY` | yes (App Store reports) | Separate App Store Connect **Team API key** with the least-privilege **Sales and Reports** role; never reuse the IAP key |
| `APPSTORE_REPORTING_VENDOR_NUMBER` | yes (App Store reports) | Vendor Number for the correct legal entity, from App Store Connect Reports |
| `APPSTORE_REPORTING_APP_APPLE_ID` / `APPSTORE_REPORTING_APP_SKU` | one required (App Store reports) | App Information identifier used to select ExecLingo rows; Apple ID takes precedence when both are set |
| `PLAY_SERVICE_ACCOUNT_EMAIL` | yes (Google server adapters) | `client_email` of an existing Google Cloud service account; server-side only |
| `PLAY_SERVICE_ACCOUNT_KEY` | yes (Google server adapters) | Its PKCS8 `private_key`; store only as a Vercel secret. Literal `\n` separators are accepted |
| `PLAY_ACCOUNT_BINDING_SECRET` | yes (Android purchases) | Stable random secret of at least 32 characters. It binds each Play purchase to one ExecLingo account; generate once and do not rotate it with `SESSION_SECRET` |
| `PLAY_IAP_UI` | yes for Android checkout | Keep `off` until the signed native build, active base plans and an internal-track purchase all pass; then set `on` in Production |
| `GA4_PROPERTY_ID` | yes (GA4 reporting) | Numeric property ID that owns the configured web stream; the collector reads `sign_up` with `platform=web` so future Android/iOS streams remain separate |
| `GOOGLE_ADS_SEARCH_CAMPAIGN_IDS` / `GOOGLE_ADS_YOUTUBE_CAMPAIGN_IDS` | yes (paid web reporting) | Comma-separated numeric campaign IDs; prevents account-wide spend or conversions from being attributed to ExecLingo by accident |
| `GOOGLE_ADS_APP_CAMPAIGN_IDS` / `GOOGLE_ADS_APP_REGISTRATION_ACTION_IDS` | yes (Android paid reporting) | Separate allowlists for `MULTI_CHANNEL` App campaigns and their native registration conversion actions; leave unset until native attribution is verified, so the report shows N/D instead of an invented zero |
| `GOOGLE_PLAY_REPORT_BUCKET` | yes (Play install reporting) | Bucket copied from Play Console → Download reports → Statistics; `gs://` prefix is accepted |
| `GOOGLE_PLAY_PACKAGE_NAME` | no | Defaults to `it.execlingo.app` |
| `CRON_SECRET` | yes (scheduled jobs) | Bearer token protecting `/api/cron/notifications` and `/api/cron/marketing-sync`; must match the GitHub Actions secret |

Never commit secrets; `.env*` is gitignored.

### GA4 web and app-stream separation

Grant `PLAY_SERVICE_ACCOUNT_EMAIL` Viewer access only to the GA4 property named
by `GA4_PROPERTY_ID`, and enable the Google Analytics Data API for its Cloud
project. The automatic report intentionally queries both `eventName=sign_up`
and `platform=web`; keep this collector filter in place when adding the
Android Firebase stream so native registrations cannot be reported as web.

The public production Measurement ID has a code fallback for the canonical
`execlingo.it` hosts. Do not expose that ID to Preview through an inherited
`NEXT_PUBLIC_GA_MEASUREMENT_ID`: either leave the variable unset there (GA4
stays off) or configure a distinct test stream. Both the initial page and
client-side SPA navigations emit `page_view` manually, only after the visitor
has granted consent; the Google tag config uses `send_page_view: false`.

Before deploying, open the GA4 web stream's Enhanced Measurement settings and
turn off **Page changes based on browser history events** under Page views. It
would otherwise duplicate the manual SPA events and could attach an unsanitised
browser URL. Other Enhanced Measurement events receive a safe global page
context before config and on every Next pathname: bearer segments are collapsed,
private routes become `/app`, same-origin referrers are collapsed the same way,
and external referrers retain only their origin. Static public landings keep only
the campaign allowlist (`utm_*` and supported advertising click IDs); all other
query parameters are removed. First-party UTM attribution remains a separate
fallback and is unaffected by this GA4 URL sanitisation.

### Apple IAP and App Store reporting keys

Apple uses two different key families, and they are not interchangeable:

- Create the IAP key under **Users and Access → Integrations → In-App Purchase**.
  Configure it as `APPSTORE_IAP_*`; it signs App Store Server API requests and
  includes the bundle ID claim.
- Create the reporting key under **Users and Access → Integrations → App Store
  Connect API → Team Keys** with the **Sales and Reports** role. Configure it as
  `APPSTORE_REPORTING_*`; Individual keys cannot access Sales and Finance.

Both private keys are downloaded once. Store the complete `.p8` PEM as a
server-side Vercel secret; literal `\n` separators are accepted. Never place the
file in the repository or expose any of these variables through `NEXT_PUBLIC_*`.

The old `APPSTORE_ISSUER_ID`, `APPSTORE_KEY_ID` and `APPSTORE_PRIVATE_KEY` names
remain an atomic, IAP-only compatibility fallback. If any `APPSTORE_IAP_*`
credential is present, all three new IAP variables are required and no old/new
mixing occurs. Reporting deliberately never reads the legacy names. Migrate IAP
first, verify purchase confirmation, then remove the legacy trio.

Retrieve the numeric Apple ID and SKU from the app's **App Information** page.
Retrieve the Vendor Number from **Reports**, checking the legal entity when the
account has more than one vendor. The iOS bundle ID in this repository is
`it.execlingo.app`; the Apple ID, SKU, Vendor Number and Issuer ID are distinct
values.

### App Store reporting smoke test

Before enabling the automatic job, choose a Summary Sales day already published
by Apple (daily reports are normally available the following day). Verify in App
Store Connect that the report contains ExecLingo's configured Apple ID or SKU,
then run the existing authenticated marketing sync once with `force=1`. Keep
`CRON_SECRET` in the shell secret store rather than a tracked script.

Confirm in the Admin dashboard that App Store tracking is not `Cieco`, that the
seven-day value has an explicit coverage end, and that it matches **Sales and
Trends → App Units** for the same Pacific Time dates. Diagnostics are intentionally
secret-free: `401` means the Team key/issuer/key ID is invalid, `403` usually means
the key lacks Sales and Reports, `429` is rate limiting, and `5xx` is an Apple
service failure. A configured Apple ID or SKU absent from every available report
is reported as an error rather than as zero downloads.

### Google Play reporting smoke test (read-only)

Reuse the service account already configured for the deployment. In Play Console
it must be active and have the global **View app information and download bulk
reports (read-only)** permission. Do not paste its private key or an access token
into the command line.

With `gcloud` already authenticated as that existing service account, choose a
closed month (current reports can lag by 3–7 days) and request only object
metadata:

```bash
PLAY_REPORT_BUCKET=pubsite_prod_rev_0123456789
PLAY_REPORT_PACKAGE=it.execlingo.app
PLAY_REPORT_MONTH=202607

gcloud storage objects describe \
  "gs://${PLAY_REPORT_BUCKET}/stats/installs/installs_${PLAY_REPORT_PACKAGE}_${PLAY_REPORT_MONTH}_country.csv" \
  --format="table(name,size,updated)"
```

A returned object validates the account, bucket, package and monthly path without
printing report rows or secrets. `401` means the active credential is not valid;
`403` means the service account lacks the global Play Console permission; `404`
means the bucket, package or selected month/path does not exist.

## 4. Install on iPhone

1. Open the deployed URL in **Safari**.
2. Share → **Add to Home Screen**.
3. Open the installed app (standalone, dark/light aware).
4. Notifications (Phase 2) will only work from the installed app on iOS.

## Debugging

- Vercel → Project → Logs shows server errors from API routes (secrets are never logged).
- `npm run build && npm start` reproduces the production build locally.
- DB inspection: `turso db shell english-buddy`.

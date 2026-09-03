# Android test plan

## Automated

| Area | Test type | Current coverage |
|---|---|---|
| Trusted web origin | JVM unit | exact HTTPS host, spoofed hosts, user-info, schemes |
| Product routing | JVM unit | annual/subscriptions vs one-time, unknown IDs |
| Bridge parsing | JVM unit | allowlisted actions/products, malformed messages |
| Obfuscated identifier | JVM unit | deterministic SHA-256, 64-character non-PII result |
| Purchase delivery | Robolectric | durable queue survives recreation and clears only after backend confirmation |

Add instrumented tests when an Android SDK is available for navigation,
permission callbacks, notification intents and WebMessageListener injection.

## Manual / Play-dependent

Billing cannot be validated with a locally installed APK. Use a Play internal
track plus license testers and Play Billing Lab. Cover product discovery,
localized price, eligible offer token, purchase, user cancellation, pending
completion, restore, renewal, grace/hold/pause, cancellation and refund.

The acceptance criterion is stronger than “the Play sheet opened”: every
successful test purchase must be verified by the backend, persisted exactly
once, acknowledged server-side and reflected in the authenticated account.

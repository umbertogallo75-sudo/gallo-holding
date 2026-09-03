# Android release 11 — mandatory gates

Do not publish or send paid Android traffic until all blocking items are green.

## 1. Local configuration

- [x] Release validated with JDK 17 and Android SDK 36.
- [x] External `google-services.json` package verified as `it.execlingo.app`
      and successfully consumed by the validation build.
- [x] External keystore/password-file signing works without copying secrets into
      the repository; the password file is owner-only (`600`).
- [x] `./gradlew testDebugUnitTest` passes (12/12 tests).
- [x] Release compile, R8 and lint pass; see `BUILD_REPORT.md`.
- [x] `./gradlew bundleRelease` produces a signed, valid AAB with version code
      11.
- [x] AAB signer exactly matches the upload certificate shown in Play Console.
- [x] Play App Signing fingerprint is verified in the live
      `/.well-known/assetlinks.json` file.

## 2. Store catalogs and price consistency

- [x] Apple and Google localized prices are recorded side by side for Italy in
      `BUILD_REPORT.md`.
- [x] Site wording uses the exact customer-facing store price or clearly states
      that store prices can follow platform tiers.
- [x] `annual` subscription exists in Play Console with active base plan
      `annual-plan` and the approved annual price.
- [x] Existing Google Play IDs `monthly`, `maintenance`, `program` remain
      active.
- [ ] Apple yearly product exists and is approved before the website card is
      enabled inside iOS.

## 3. Backend — blocking before real money

- [ ] Google Play service account and Android Publisher API work in production.
- [ ] A purchase token is uniquely bound to one ExecLingo user.
- [ ] The authenticated page passes a stable server-issued opaque account hint
      to `purchase()` and the backend validates Google's external account ID.
- [ ] Duplicate confirms are idempotent and never duplicate conversion events.
- [ ] After successful persistence the page calls
      `ExecLingoNative.purchaseResult(token, true)`; failures report `false`.
- [ ] Maintenance eligibility is enforced server-side, not only in the UI.
- [ ] Multiple historical/active entitlements cannot overwrite each other.
- [ ] RTDN handles renewals, grace period, pause, hold, expiry and cancellation.
- [ ] Voided/refunded one-time purchases revoke the corresponding entitlement.
- [ ] Backend acknowledges only after verification and entitlement persistence.
- [ ] A production readiness check prevents the site from showing Play checkout
      if verification/acknowledgement credentials are unavailable.

## 4. Internal Play track tests

- [x] Release 11 is published to the active internal track and the existing
      `Tester ExecLingo` mailing list (2 testers) is selected.
- [ ] Install release 11 from Play's internal testing track (never sideload for
      billing acceptance).
- [ ] Fresh email registration and existing-account login work.
- [ ] Google/Apple login round trips return to the verified App Link.
- [ ] Catalog returns localized Play prices; no hard-coded price is displayed.
- [ ] Buy `program`; access appears only after server verification.
- [ ] Buy `monthly`, `maintenance` (eligible user) and `annual` separately.
- [ ] Cancel purchase sheet: no entitlement and clear, recoverable UI.
- [ ] Pending purchase: no access until Play reports `PURCHASED`.
- [ ] Restore after reinstall and on a second Android device.
- [ ] Cancel, grace, pause/hold, renew and refund in Play Billing Lab.
- [ ] Microphone permission + live voice session with Sam.
- [ ] Push opt-in, token registration, notification delivery and deep link.
- [ ] External links open outside the privileged WebView.
- [ ] App Link opens the correct internal page.

## 5. Rollout

- [ ] Enable the server's Android IAP UI only after all prior gates pass.
- [ ] Upload to production as a staged rollout, starting at 10%.
- [ ] Monitor crashes, Play billing errors, confirm API errors, registrations,
      purchases and restore failures for at least 24 hours.
- [ ] Increase rollout only if no payment can be charged without entitlement.
- [ ] Activate Android ad conversion/budget only after a real end-to-end
      registration and a license-tester purchase are visible in reporting.

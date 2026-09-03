# Android 1.1.0 — build 12 release record

Date: 2 September 2026. Package: `it.execlingo.app`.

## Reason for replacing build 11

The final pre-publication audit found that build 11 included Firebase Analytics
and advertising-ID permissions, without native Analytics consent controls.
Suppressing web tags in the WebView did not suppress the native SDK.

Build 12 removes the unused native Analytics dependency, deactivates Analytics
in the manifest as a defense in depth, and excludes the three advertising
permissions inherited by build 11. FCM opt-in, Install Referrer, voice, account
access and Billing code are unchanged. The public version remains **1.1.0**.

This release does **not** implement a native `sign_up` event or claim that GA4
native installs are measured. Use Play Console acquisition metrics and the
backend's `register_done`/Android registrations as separate sources. Missing
Firebase-native data is **N/D**, not zero. Re-enabling native Analytics requires
a dedicated release with optional consent, revocation and end-to-end tests.

## Verified artifact and tests

- Signed AAB SHA-256:
  `4b9c842faca11034168e89c638ed29b1202814a8fde4b83f63696360f640d0b0`.
- Upload certificate SHA-256:
  `34:C7:9D:32:38:2C:BE:88:F2:0C:C4:42:01:E6:8A:14:B5:E2:95:7D:23:4F:9E:BE:99:39:3F:31:5D:CC:3E:E3`.
  Exact match with the upload key previously verified in Play Console.
- BundleTool validation passed; final manifest reports version code 12,
  version name 1.1.0, min SDK 23 and target SDK 36.
- Final manifest has no AD_ID or AdServices permissions, no Measurement
  service/receiver or AnalyticsConnector registrar. Analytics deactivation is
  true and advertising-ID collection is false.
- 12 Android unit tests passed. Release Kotlin/Java compilation, R8 and lint
  passed (0 errors, 14 non-blocking lint warnings).
- 411 project tests passed, including four new privacy regression tests.
- Static configuration, XML, ESLint and diff checks passed.
- Build generated in an isolated temporary directory because the existing
  synchronized build folder contained duplicate generated resource files.
  No source or previous release artifact was deleted.

## Distribution status

Build 12 was published to the existing internal track at 21:12 Europe/Rome;
Play Console confirms it is available to internal testers and replaces build
11 on that track. No new tester access was created.

Production still contains the previously saved, unsubmitted release 11+10
at 10%. Managed publishing is enabled and the public release remains build
10. Google disables creating another release and redirects edits of the saved
release to its read-only summary. Its discard dialog states that only the
unsubmitted release is removed and the uploaded bundles remain in the library.
Confirmation to remove this preparation and replace it with build 12 was
requested; **build 12 has not yet been submitted for production review**.

The replacement must retain build 10 only for device compatibility and keep
managed publishing plus a prepared 10% staged rollout. Do not submit build 11.

Before declaring no advertising-ID use in Play Console, verify that build 11
is no longer included in any active or pending release. Play's bundle explorer
shows no advertising-ID permissions for the existing build 10.

## Remaining public-release and purchase gates

- Google review is not equivalent to publication or device acceptance.
- Install from the Play internal track on a real Android device and verify
  email registration/login, microphone and voice, push opt-in and links.
  Native social-login buttons are intentionally not offered; their missing
  browser-to-native handoff is not a release failure for this email-login UI.
- Do not enable or claim real-money checkout readiness without verified
  license-tester purchases, restore, entitlement ownership and lifecycle
  handling, including RTDN and refunds. No IAP flag was changed in this work.
- See the outstanding purchase scenarios in `RELEASE_CHECKLIST.md`; the
  build-11 report is historical and is not evidence of build-12 publication.

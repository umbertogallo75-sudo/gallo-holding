# Android release 11 — build report

**Date:** 2 September 2026  
**Scope:** native Android project and Google Play internal test; no production
rollout

## Verified

- Gradle 8.13, Android Gradle Plugin 8.13.2 and Kotlin 2.3.21 completed a
  real build with a temporary JDK 17 and Android SDK 36.
- `testDebugUnitTest`: **12 tests passed, 0 failed**.
- Static configuration/XML/secret check: **passed**.
- Release compilation, R8 shrinking and release lint: **passed** (0 errors;
  14 non-blocking warnings, principally dependency update notices and the
  intentional WebKit pin required by min SDK 23).
- `google-services.json` was consumed directly from its external path; it was
  not copied into the repository. Its Android package is `it.execlingo.app`.
- BundleTool verified the resulting manifest: application ID
  `it.execlingo.app`, version code `11`, version name `1.1.0`, min SDK `23`,
  target/compile SDK `36`, verified App Link and FCM FID registration metadata.

## Signed release artifact

```text
app/build/outputs/bundle/release/app-release.aab
SHA-256 46b38870771943aaf9f2ec4abfdf146350a01e454e9e2f773e28064a50c082e1
```

The artifact is signed, ZIP-integrity checked and accepted by BundleTool
validation. `jarsigner` reports `jar verified`; its expected warnings concern
the self-signed upload certificate, missing timestamp and AAB ZIP attributes,
not an invalid signature.

## Signing verification

- Upload key alias: `execlingo`.
- Certificate subject: `CN=ExecLingo, O=VASP ITALIA SRL, L=Napoli, C=IT`.
- Signed AAB SHA-256 certificate fingerprint:
  `34:C7:9D:32:38:2C:BE:88:F2:0C:C4:42:01:E6:8A:14:B5:E2:95:7D:23:4F:9E:BE:99:39:3F:31:5D:CC:3E:E3`.
- Play Console upload-certificate SHA-256 fingerprint:
  `34:C7:9D:32:38:2C:BE:88:F2:0C:C4:42:01:E6:8A:14:B5:E2:95:7D:23:4F:9E:BE:99:39:3F:31:5D:CC:3E:E3`.
- Result: **exact match**.

Signing consumed the keystore and password file from external absolute paths.
The password file was restricted to owner-only mode `600`; neither secret was
copied into the repository, stored in Gradle properties nor printed in command
output. The unrelated historic pharmacy certificate was not used.

The Play App Signing certificate is distinct from the upload certificate. Its
SHA-256 fingerprint is
`37:ED:AC:C9:2B:34:2C:74:36:39:21:FF:D2:9E:B5:31:36:D6:5D:CB:CF:ED:1E:D0:3E:9F:71:9D:ED:20:5A:6A`
and is present in the production App Links file at
`https://www.execlingo.it/.well-known/assetlinks.json`.

## Store prices verified for Italy

| Plan | Website | Apple App Store | Google Play |
| --- | ---: | ---: | ---: |
| Monthly | 39.90 EUR | 39.99 EUR | 39.99 EUR |
| Maintenance | 29.90 EUR | 29.99 EUR | 29.99 EUR |
| 3-month program | 99.90 EUR | 99.99 EUR | 99.99 EUR |
| Annual | 199.00 EUR | 199.00 EUR | 199.00 EUR |

The native clients request localized prices from StoreKit/Play Billing. The
website explains that the stores show their official localized price before
confirmation. The Apple annual product has been submitted and remains subject
to Apple review.

## Google Play internal test

- Release `11 (1.1.0)` was accepted and published to the internal testing
  track on 2 September 2026.
- The track is active and reports the release as available to internal testers.
- The existing `Tester ExecLingo` mailing list is selected (2 testers).
- The Play Console warnings are non-blocking: no native debug-symbol archive
  was supplied, while the ReTrace mapping file is attached automatically.
- No production rollout was started and the Android IAP feature flag remains
  off until the backend and purchase scenarios below pass.

## Still blocked before real-money release

- Configure the production Play service account and account-binding secret,
  then validate the implemented ownership, verification, persistence and
  acknowledgement flow with a license-tester purchase.
- Complete RTDN plus voided/refunded purchase handling.
- Pass every backend and internal-track scenario in `RELEASE_CHECKLIST.md`.

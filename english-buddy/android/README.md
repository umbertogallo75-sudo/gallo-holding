# ExecLingo Android — release 12

Native Android shell for the existing ExecLingo Play listing (`it.execlingo.app`).
It replaces the production TWA without creating a new store app or package.

## Release facts

- `versionCode`: **12** (privacy correction replacing the internal release 11)
- `versionName`: **1.1.0**
- `minSdk`: **23**
- `compileSdk` / `targetSdk`: **36**
- Google Play Billing: **9.1.0**
- Website: `https://www.execlingo.it/home?app=android`
- User-Agent suffix: `ExecLingoAndroid/1.1.0`
- Native Firebase Analytics: **not included; collection explicitly deactivated**
- Advertising ID / AdServices permissions: **manifest merge rules enforce removal**

These are build configuration facts, not confirmation of a public rollout.
Confirm the active versions in Play Console. `docs/BUILD_REPORT.md` preserves
the historical release-11 build results and must not be read as release-12
verification.

Prices, titles, eligibility and offer tokens are fetched from Google Play at the
time of purchase. There are no hard-coded prices in the Android source.
Checkout also fails closed until the authenticated website supplies a stable,
opaque server-issued account hint.

## Local prerequisites

1. Install Android Studio with JDK 17, Android SDK Platform 36 and Build Tools
   36.x.
2. Keep the existing Firebase file outside the repository and pass its path to
   Gradle:

   ```text
   -PgoogleServicesFile=/Users/umbertogallo/Downloads/google-services.json
   ```

   The file was checked to target `it.execlingo.app`. An ignored
   `app/google-services.json` is also supported for Android Studio, but the
   external property is preferred. Without either source, the project compiles
   but Firebase push is not configured at runtime. Native Analytics is
   intentionally absent, not an integration waiting to be configured.
3. Prefer the path-only signing interface. Keep the existing keystore and
   password file outside the repository, make the password file owner-only
   (`chmod 600`) and pass only their paths plus the non-secret alias:

   ```text
   -PuploadKeystoreFile=/absolute/path/execlingoupload.keystore
   -PuploadPasswordFile=/absolute/path/keystorepassword.txt
   -PuploadKeyAlias=execlingo
   ```

   The password file is used for both the PKCS12 store and private key. A
   distinct key password can be supplied with
   `-PuploadKeyPasswordFile=/absolute/path/key-password.txt`. The legacy
   ignored `android/keystore.properties` path remains supported for Android
   Studio. Never put passwords on the command line or copy the keystore,
   password files, or their contents into source control.

## Build

From this directory:

```text
./gradlew test
./gradlew bundleRelease \
  -PgoogleServicesFile=/absolute/path/google-services.json \
  -PuploadKeystoreFile=/absolute/path/execlingoupload.keystore \
  -PuploadPasswordFile=/absolute/path/keystorepassword.txt \
  -PuploadKeyAlias=execlingo
```

Expected bundle:

```text
app/build/outputs/bundle/release/app-release.aab
```

The release bundle is signed when the external signing properties above are
provided, or when the ignored legacy `keystore.properties` is present and
valid. An internal-track upload is used for device acceptance testing.
Production review may be requested with managed publishing enabled; do not
publish to users or enable real-money checkout before the applicable gates
in `docs/RELEASE_CHECKLIST.md` and `docs/RELEASE_12_REPORT.md` pass.

## Privacy release gates

Release 12 removes the unused native Analytics SDK because the shell does not
have a native analytics-consent flow. The manifest also sets
`firebase_analytics_collection_deactivated=true` and
`google_analytics_adid_collection_enabled=false`, and removes inherited
`AD_ID`, `ACCESS_ADSERVICES_AD_ID` and `ACCESS_ADSERVICES_ATTRIBUTION`
permissions. A future analytics/consent integration requires a dedicated,
reviewed app release; enabling it from the website is not sufficient.

Before submission:

1. Run `scripts/static-check.sh` and, from the repository root,
   `npm test -- tests/android-privacy-config.test.ts`.
2. Inspect the **exact signed release-12 AAB** with bundletool: version code 12,
   no advertising/AdServices permissions, the two privacy metadata values
   above, and no Firebase Analytics/Measurement SDK in its dependency graph.
   Source checks alone do not prove the contents of the uploaded artifact.
3. Replace release 11 on every active test/production track before declaring
   that the app does not use Advertising ID. Check all retained artifacts,
   including release 10 if used as the unsupported-device fallback.
4. Align Play Data Safety and the privacy policy with the actual release.
   Before public distribution, reconfirm login, microphone, session
   persistence and opt-in notifications on a device. Native purchase
   readiness remains a separate release gate.

FCM registration remains opt-in. Install Referrer, Billing and first-party
backend registration tracking are unchanged. Native Firebase events such as
`first_open` are not available in release 12; store download metrics and
backend registrations must not be represented as equivalent native events.

## Play catalog contract

| Product ID | Type | Preferred plan / purchase option |
|---|---|---|
| `program` | one-time | `buy` |
| `monthly` | subscription | `monthly-base` |
| `maintenance` | subscription | `maintenance-base` |
| `annual` | subscription | `annual-plan` |

The native client requires this exact catalog mapping. In particular, the
active annual base plan is `annual-plan`; it deliberately does not fall back to
another plan or offer when that exact identifier is unavailable.

## Important

The app never acknowledges, consumes or grants access. It returns the purchase
token to the authenticated ExecLingo page; the backend verifies with Google,
persists the entitlement, reports success to the app and only then acknowledges
Google. Until that backend confirmation, the app keeps the token in a private
durable retry queue. A client-only acknowledgement would make it possible to
charge a customer without safely granting access.

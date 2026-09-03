# Android architecture decision

**Status:** implemented, published to internal testing only

**Release:** 11 / 1.1.0

## Decision

Use a small native Android application containing a hardened WebView rather
than another Trusted Web Activity. The public product remains the website, but
the native layer owns capabilities that require Android APIs: Play Billing,
Firebase push, microphone permission, Install Referrer and verified App Links.

## Trust boundary

The privileged bridge is implemented with AndroidX WebKit
`addWebMessageListener`, allowlisted to exactly:

```text
https://www.execlingo.it
```

The listener accepts main-frame messages only and checks the source origin a
second time. A document-start shim provides the website-compatible API:

```text
window.ExecLingoNative.purchase(productId[, opaqueAccountHint])
window.ExecLingoNative.restore()
window.ExecLingoNative.requestPush()
window.ExecLingoNative.requestMic()
window.ExecLingoNative.getProducts(productIds)
window.ExecLingoNative.purchaseResult(purchaseToken, backendPersisted)
```

Foreign top-level links open in the device browser. Cleartext traffic, file
access, content access, mixed content and third-party cookies are disabled.
There is deliberately no `addJavascriptInterface` fallback, because it would
expose privileged methods to every frame. Devices with an obsolete WebView can
use the app but cannot invoke native commerce until WebView/Chrome is updated.

## Website callbacks

Existing callbacks are preserved:

- `window.__playPurchased(productId, purchaseToken)`
- `window.__playFailed(reason)`
- `window.__fcmToken(token)` / `window.__fcmDenied(reason)`

Additional forward-compatible callbacks:

- `window.__playProducts(localizedProducts)`
- `window.__micGranted()` / `window.__micDenied(reason)`
- `window.__installReferrer(details)`

Arguments are JSON-encoded before JavaScript evaluation, and callback names
are selected from a fixed native allowlist.

With Firebase Messaging 25+, the established `__fcmToken` callback name carries
the registered Firebase Installation ID (FID), as recommended by the current
FCM API. The manifest opts into FID registration, `requestPush()` calls
`register()`, and `onRegistered()` persists rotated identifiers privately.

## Billing lifecycle

1. Validate the requested product and require a safe server-issued account
   hint. Without it, fail closed before opening the real-money Play sheet.
2. Query fresh `ProductDetails` from Play.
3. Select the regular preferred base plan / purchase option and its eligible
   offer token.
4. Launch Google Play's purchase sheet with a hashed, non-PII account marker.
5. For `PURCHASED`, first persist product + token in a private durable queue,
   then return them to the website.
6. For `PENDING`, grant nothing and show a pending result.
7. The backend verifies and persists the entitlement; the page then calls
   `purchaseResult(token, true)` and only then may the native queue mark the
   delivery complete.
8. The backend acknowledges Google only after persistence.
9. Setup, every foreground, explicit restore and billing-page hydration query
   both subscriptions and one-time products. Failed setup is retried with a
   bounded backoff.

The current website reloads after one successful restore, so the client sends
the strongest active entitlement first: annual, monthly, maintenance, then the
one-time program. When any active subscription is returned by Play, the old
permanently-owned `program` purchase is suppressed so it cannot overwrite a
current maintenance entitlement. The server must remain idempotent and model
multiple/historical entitlements correctly.

## Consequences and known limits

- A temporary JDK 17 / SDK 36 toolchain completed unit tests and a signed
  release build. Version 11 is available on the active Play internal-testing
  track; see `BUILD_REPORT.md`.
- The locally available Firebase configuration and upload keystore are not
  copied into the repository by design.
- No account marker is sent until the website supplies an opaque,
  server-issued account hint. A device/install ID is deliberately not used as
  account identity. The backend checks both Google's external account marker
  and first-owner token binding, but this path still requires an end-to-end
  license-tester purchase with production credentials.
- RTDN and refund/revocation handling still require hardening before a
  real-money rollout; see the release checklist.

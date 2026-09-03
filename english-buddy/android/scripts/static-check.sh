#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)

assert_contains() {
    file=$1
    expected=$2
    if ! grep -F "$expected" "$file" >/dev/null; then
        echo "Manca '$expected' in $file" >&2
        exit 1
    fi
}

assert_contains "$ROOT/app/build.gradle.kts" 'applicationId = "it.execlingo.app"'
assert_contains "$ROOT/app/build.gradle.kts" 'compileSdk = 36'
assert_contains "$ROOT/app/build.gradle.kts" 'targetSdk = 36'
assert_contains "$ROOT/app/build.gradle.kts" 'versionCode = 12'
assert_contains "$ROOT/app/build.gradle.kts" 'billing-ktx:9.1.0'
assert_contains "$ROOT/app/build.gradle.kts" 'gradleProperty("uploadKeystoreFile")'
assert_contains "$ROOT/app/build.gradle.kts" 'gradleProperty("uploadPasswordFile")'
assert_contains "$ROOT/app/build.gradle.kts" 'mode 600 or stricter'
assert_contains "$ROOT/build.gradle.kts" 'org.jetbrains.kotlin.android") version "2.3.21"'
assert_contains "$ROOT/app/src/main/java/it/execlingo/app/billing/ProductCatalog.kt" 'PlayProduct("annual", ProductKind.SUBSCRIPTION, "annual-plan")'
assert_contains "$ROOT/app/src/main/java/it/execlingo/app/web/BridgeScript.kt" 'ExecLingoNative'
assert_contains "$ROOT/app/src/main/java/it/execlingo/app/web/BridgeScript.kt" 'purchaseResult'
assert_contains "$ROOT/app/src/main/java/it/execlingo/app/billing/PurchaseDeliveryQueue.kt" 'confirmed_token_hashes_v1'
assert_contains "$ROOT/app/src/main/java/it/execlingo/app/billing/BillingController.kt" 'callbacks.onPurchaseFailed("account-binding-required")'
assert_contains "$ROOT/app/src/main/java/it/execlingo/app/billing/BillingController.kt" 'queryOwnedPurchases(explicitRestore = false)'
assert_contains "$ROOT/app/src/main/java/it/execlingo/app/security/TrustedOrigin.kt" 'const val HOST = "www.execlingo.it"'

find "$ROOT/app/src/main/res" -type f -name '*.xml' -exec xmllint --noout '{}' ';'
xmllint --noout "$ROOT/app/src/main/AndroidManifest.xml"
unzip -t "$ROOT/gradle/wrapper/gradle-wrapper.jar" >/dev/null

if find "$ROOT" -type f \( -name 'google-services.json' -o -name '*.keystore' -o -name '*.jks' \) | grep . >/dev/null; then
    echo "Trovato un segreto/keystore nel progetto Android." >&2
    exit 1
fi

echo "Android static checks: OK"

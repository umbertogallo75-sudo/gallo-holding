# ExecLingo per Android

App nativa (Kotlin) che apre il sito dentro una WebView di proprietà, così il
comportamento non dipende più dal browser installato: il TWA passava per Chrome
e su Samsung Internet il Play Billing falliva con `clientAppUnavailable`.

Due ponti sono esposti alla pagina come `window.ExecLingoNative`:

| metodo | cosa fa | risposta alla pagina |
| --- | --- | --- |
| `requestPush()` | permesso notifiche + token FCM | `window.__fcmToken(token)` / `__fcmDenied(reason)` |
| `purchase(id)` | apre il foglio Play Billing | `window.__playPurchased(id, token)` / `__playFailed(reason)` |
| `restore()` | rilegge gli acquisti attivi | come sopra |

Lo user agent aggiunge `ExecLingoAndroid/1.0`: è così che il server riconosce
la shell (`src/lib/appclient.ts`) e mostra i piani Play invece di Stripe.

## Build

Serve una JDK 17 e l'SDK Android (platform 36, build-tools 35+).

```sh
export JAVA_HOME=/percorso/jdk-17
export ANDROID_HOME=/percorso/android_sdk
export EXECLINGO_KEYSTORE=/percorso/execlingo-upload.keystore
export EXECLINGO_KEYSTORE_PASSWORD=...
export EXECLINGO_KEY_ALIAS=execlingo
export EXECLINGO_KEY_PASSWORD="$EXECLINGO_KEYSTORE_PASSWORD"

./gradlew clean bundleRelease        # app/build/outputs/bundle/release/app-release.aab
./gradlew assembleDebug              # APK per prove su dispositivo
```

Il keystore di upload **non** è nel repository: va custodito a parte (senza,
Play non accetta più aggiornamenti di `it.execlingo.app`).
`google-services.json` invece non è un segreto — è la configurazione pubblica
del progetto Firebase `execlingo`. La chiave privata del service account
(`execlingo-*.json`) sta solo su Vercel, mai qui.

## Nessuna funzionalità hardware obbligatoria

Microfono, orientamento verticale e touchscreen sono dichiarati
`android:required="false"`: senza quelle righe Play li deduce dai permessi e
dall'orientamento dell'activity e nasconde l'app ai dispositivi che non li
hanno. Chat, missioni e notifiche funzionano anche senza microfono.

## Versioni pubblicate

| versionCode | note |
| --- | --- |
| 3–4 | TWA (bubblewrap), sostituito |
| 5 | prima app nativa |
| 6 | nessuna feature hardware obbligatoria, targetSdk 36 |
| 7 | barra dei menu non più sotto quella di sistema |
| 8 | Libreria Fatturazione Google Play 8.3.0 (obbligatoria dal 31 ago 2026) |
| 9 | il permesso microfono viene finalmente chiesto ad Android |
| 10 | il canale notifiche esiste dall'avvio: l'app compare in Impostazioni → Notifiche |

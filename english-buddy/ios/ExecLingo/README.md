# ExecLingo iOS

Wrapper nativo iOS (SwiftUI + WKWebView + StoreKit 2) dell'app web execlingo.it.
Costruito e distribuito tramite Xcode Cloud (scheme condiviso: ExecLingo).
Bundle ID: it.execlingo.app · Team: 3STV2S3XAG · Deployment target: iOS 16.

Versione di marketing corrente: **1.3**. Il numero di build progressivo viene
assegnato da Xcode Cloud durante l'archiviazione per App Store Connect.

## Acquisti in-app

Il ponte StoreKit 2 legge e mostra i prezzi localizzati direttamente da Apple.
Prodotti previsti: `it.execlingo.app.monthly`, `it.execlingo.app.annual`,
`it.execlingo.app.maintenance` (rinnovo automatico) e
`it.execlingo.app.program` (una tantum). In Italia l'annuale usa il price point
Apple da 199,00 €.

## La versione pubblica, e perché si alza

`MARKETING_VERSION` è la versione che vede l'utente (1.4). `CURRENT_PROJECT_VERSION`
è il numero di build, e lo scrive `ci_scripts/ci_post_clone.sh` dal numero della
esecuzione di Xcode Cloud: non va toccato a mano.

**Quando una versione è stata approvata sull'App Store, il suo "treno" si chiude.**
Da quel momento App Store Connect rifiuta ogni caricamento con lo stesso
`MARKETING_VERSION`, con questo messaggio:

    Invalid Pre-Release Train. The train version 'X.Y' is closed for new build submissions
    CFBundleShortVersionString [X.Y] must contain a higher version than the
    previously approved version [X.Y]

Xcode Cloud non mostra quel testo: la build si ferma su «Preparing build for App
Store Connect failed», senza motivo e senza codice, ed è quello che ha bruciato
le build 31, 32 e 33. Il messaggio vero si vede solo caricando l'`.ipa` a mano
con Transporter.

**Quindi: dopo ogni versione approvata, alza `MARKETING_VERSION` prima della
build successiva.** È l'unica cosa da ricordare.

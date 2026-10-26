# ExecLingo iOS

Wrapper nativo iOS (SwiftUI + WKWebView + StoreKit 2) dell'app web execlingo.it.
Costruito e distribuito tramite Xcode Cloud (scheme condiviso: ExecLingo).
Bundle ID: it.execlingo.app · Team: 3STV2S3XAG · Deployment target: iOS 16.

Versione di marketing corrente: **1.5**, non ancora caricata. Sull'App Store
è pubblica la **1.4** ("Pronta per la distribuzione", 26 ottobre 2026), quindi
il treno della 1.5 è ancora aperto. Il numero di build progressivo viene
assegnato da Xcode Cloud durante l'archiviazione per App Store Connect.

## Acquisti in-app

Il ponte StoreKit 2 legge e mostra i prezzi localizzati direttamente da Apple.
Prodotti previsti: `it.execlingo.app.monthly`, `it.execlingo.app.annual`,
`it.execlingo.app.maintenance` (rinnovo automatico) e
`it.execlingo.app.program` (una tantum). In Italia l'annuale usa il price point
Apple da 199,00 €.

## La versione pubblica, e perché si alza

`MARKETING_VERSION` è la versione che vede l'utente (1.5). `CURRENT_PROJECT_VERSION`
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

## Il contratto che blocca tutto, e che nessun agente può firmare

Prima di poter caricare un aggiornamento, l'Account Holder deve accettare di
persona due contratti su App Store Connect, in quest'ordine:

1. l'**Apple Developer Program License Agreement** aggiornato, su
   developer.apple.com nella pagina dell'account;
2. il **Paid Applications Schedule** (Schedule 2), nel modulo **Business** di
   App Store Connect.

Finché mancano, App Store Connect mostra un avviso giallo in cima alla lista
delle app e rifiuta ogni invio di aggiornamento, ogni nuovo acquisto in-app e
ogni nuova app. La build di Xcode Cloud può riuscire lo stesso: il blocco
arriva dopo, al momento dell'invio.

Sono contratti legali che vincolano VASP ITALIA SRL. **Li legge e li accetta
Umberto, a mano.** Nessun agente deve spuntare quelle caselle, nemmeno se ha
accesso alla pagina.

## Screenshot per iPhone Duo: da aprile 2027

Apple avvisa che **da aprile 2027 gli screenshot per iPhone Duo saranno
obbligatori per qualsiasi app compilata con l'SDK iOS 27.1 o successivo.**
Non è un blocco per le build di adesso, ma dal momento in cui passiamo a quel
SDK la scheda dell'App Store andrà rifatta con gli screenshot dei due schermi
prima di quella data.

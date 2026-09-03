# Correzione abbonamenti Google — 3 settembre 2026

## Problema e correzione

Un ripristino aggiornava direttamente l'unica riga `billing` dell'utente.
Un vecchio programma scaduto o un mensile inattivo poteva quindi sostituire
l'annuale ancora valido. Le regressioni iniziali hanno riprodotto quattro
fallimenti su sei casi; non sono stati utilizzati acquisti o utenti reali.

Ora ogni token Google conserva il proprio stato verificato in
`google_purchase_entitlements`. Proprietà, aggiornamento del token e riepilogo
Google sono scritti nella stessa transazione. Il titolo valido con scadenza
maggiore determina l'accesso; una revoca agisce solo sul suo token e consente
il recupero di un altro titolo valido. Resta la tolleranza temporale già
prevista dal modello; una revoca esplicita prevale subito sulla scadenza.

Le risposte di verifica iniziate prima di una verifica già registrata non
sovrascrivono lo stato nuovo. A parità di millisecondo prevale lo stato
inattivo. Una verifica realmente successiva può riattivare l'acquisto.
La data di un programma non viene più inventata quando Google non la fornisce.

La conferma registra gli stati inattivi solo dopo il controllo di proprietà,
senza confermarli a Google o contarli come conversioni. Una risposta obsoleta
richiede un nuovo tentativo. I metadati della conversione continuano a riferirsi
al prodotto acquistato, non all'eventuale piano annuale già presente.

Il cron legge anche i token non selezionati nel riepilogo e quelli recentemente
inattivi. Registra separatamente ogni tentativo di controllo, anche fallito:
25 token con errore non bloccano quelli successivi. Errori API/rete non sono
revoche e risposte obsolete non incrementano i contatori.

## Compatibilità e dati

- Migrazione `0027` additiva: due nuove tabelle, nessuna eliminazione di dati.
- Schema predisposto prima della transazione, con supporto ai database legacy.
- Il solo titolo Google noto nella precedente riga billing viene conservato
  una volta; una riga revocata del ledger non viene mai ricreata come attiva.
- Le righe raw Apple/Stripe/licenze/accessi gratuiti non vengono sostituite
  da Google: restano disponibili gli identificativi per portale e fatture.
- Il resolver considera i titoli Google separatamente; la pagina abbonamento
  mostra piano e scadenza effettivi senza cambiare prezzi.
- La cancellazione di un account comprende entrambe le nuove tabelle.
- Token storici presenti solo nel registro proprietari, senza stato/scadenza,
  non vengono dichiarati attivi: serve una nuova verifica autorevole Google.

## Verifiche

- Suite completa: **62 file, 444 test superati**.
- ESLint sull'intero progetto: superato senza errori.
- Regressioni entitlement: **16 test**; cron: **14 test**.
- Tre nuovi test route: revoca propria, revoca di altro account, risposta obsoleta.
- Build Next.js di produzione e TypeScript superati in una copia isolata.
  Il controllo nella cartella originale incontrava duplicati generati `.next`
  (`… 2.ts`), non errori del sorgente: nessun file dell'utente è stato cancellato.
- Revisione indipendente: GO dopo correzione di coda cron e contatori stale.
- Database di test temporanei su disco: il client libSQL in memoria perdeva
  visibilità dopo la chiusura della transazione; la variante su disco riproduce
  correttamente il comportamento persistente, senza indebolire le asserzioni.

## Rilascio e limiti

Modifica del backend/web: non cambia l'AAB Android 12 in revisione né la build
Apple già inviata. Integrata sulla base dell'ultimo commit produzione
`7c76188`, mantenendo la correzione del blocco schermo durante le conversazioni.

Questa correzione **non certifica** acquisti license-tester, voce e ripristino
su telefono, RTDN, revoche/rimborsi automatici dei programmi, API live o stato
del flag checkout. Non riscrive il ciclo delle notifiche Apple/Stripe.
Nessun prezzo, flag store, account, metodo di pagamento o acquisto reale viene
modificato dal collaudo.

In caso di errori applicativi nuovi dopo il deploy: fermare l'esposizione del
checkout con un intervento autorizzato e ripristinare il deployment precedente
se necessario. Conservare le tabelle additive e gli stati verificati: non
eliminarli per effettuare un rollback. Il ritorno al vecchio codice ripristina
anche il vecchio difetto e non è una soluzione definitiva.

Fonti tecniche:
- [Ciclo abbonamenti Google](https://developer.android.com/google/play/billing/lifecycle/subscriptions)
- [Transazioni libSQL/Turso](https://docs.turso.tech/sdk/ts/reference)

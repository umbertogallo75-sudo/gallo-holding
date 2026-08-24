# Onboarding e home coach-first

## Da dove nasce

I tester hanno detto la stessa cosa con parole diverse: aprono l'app e non
sanno cosa fare né da dove iniziare.

Il conto, misurato sul codice di allora: **ventuno cose toccabili** sulla prima
schermata dopo la registrazione — fino a quattro card, sedici modalità nella
griglia, tre statistiche a zero, la card del programma referral, quattro voci
nella barra. E in cima, come titolo, **una domanda**: «What can you do right
now?».

Il problema non era il numero. Era che la pagina chiedeva all'utente di
decidere, mentre l'utente aveva aperto l'app proprio perché non lo sapeva.

## Nota sulla provenienza di questo documento

Questo file **non è la specifica originale**. La spec stava in una sessione
locale sul Mac e non è stato possibile recuperarla. È stato ricostruito dai
undici punti numerati che Umberto ha dettato, dalle quattro decisioni che ha
chiuso, e da quello che è stato effettivamente implementato. Dove la spec
originale aveva dettagli — il copy esatto delle domande, la tabella di
rinomina, la matrice — quei dettagli sono stati scritti qui e vanno letti come
proposte messe in produzione, non come requisiti verificati contro l'originale.

## Fase 1 — quello che si poteva togliere subito

**1. Lo splash non chiede più il permesso di aprirsi.** Diceva TAP PER AVVIARE
e aspettava. Adesso è una schermata di caricamento: sta al massimo 1,5 secondi
e se ne va da sola. Le pagine pubbliche non la vedono mai.

*Conseguenza nota:* la voce di Sam partiva dentro il tocco, l'unico momento in
cui iOS lascia iniziare l'audio. Senza tocco, su iPhone resta muto finché non
si preme «Riascolta Sam».

**2. Il tab Sam apre Sam.** Prima apriva un foglio che chiedeva «scritta o
vocale?». La scritta è il default perché funziona ovunque; il microfono è nel
composer, accanto a dove si scrive.

**3. Niente tre zeri in faccia.** I contatori compaiono quando c'è qualcosa da
contare.

**4. Interfaccia in italiano, ogni cosa detta una volta.** Ogni card aveva
titolo e sottotitolo in inglese più la traduzione italiana sotto: tre righe per
card, per sedici card. L'inglese che resta è quello che si insegna — i turni di
Sam, le frasi del frasario, le dettature. `/admin` non è stato tradotto: lo vede
solo il proprietario.

## Fase 2 — l'onboarding

**5. Tre domande, un tocco ciascuna.** Da dove parti · A cosa ti serve · Quanto
tempo hai. Ogni risposta avanza da sola, tre pallini dicono quanto manca,
«Salta» applica i default. Il nome non si chiede: è già stato dato alla
registrazione.

Campi nuovi (migrazione `0023_onboarding.sql`):
- `daily_minutes` — decide quale sessione proporre
- `onboarding_done_at` — distingue «ha risposto» da «ha un profilo»

**6. Le risposte diventano subito una sessione.** Fine onboarding →
`/piano`, che mostra per 2,5 secondi cosa ha capito l'app → la prima sessione
parte da sola. Nessun pulsante «pronto?»: sarebbe la quarta domanda.

Il permesso notifiche si chiede **solo** alla fine di quella sessione, dopo tre
scambi. È stato tolto dalla home.

**7. Chi era già registrato riceve l'offerta una volta.** Fascia in home, «30
secondi per personalizzare il tuo percorso». «Non ora» è una risposta: applica
i default e non ricompare. Riempie solo ciò che è vuoto — un livello già scelto
non viene sovrascritto.

## Fase 3 — la home

**8. In cima, dove sei.** «Giorno *n* di 90 · *obiettivo*» con la barra. Al
posto della domanda, la risposta.

**9. Una sola cosa colorata: la sessione di oggi.** Già scelta, con il motivo
sotto e INIZIA sopra.

**10. Sotto, tre scorciatoie e una porta.** Sono in riunione · Preparami a un
impegno · Mi serve adesso. Poi **📋 Tutti gli allenamenti →**, sempre visibile,
che apre `/allenamenti` con tutte e sedici le attività: **nessuna è stata
rimossa**, si sono spostate di un tocco.

**11. Undici eventi** dalla prima domanda alla prima sessione, sullo stesso
endpoint delle pagine pubbliche: un solo imbuto dall'annuncio alla
conversazione.

## La matrice (`src/lib/learning/first-session.ts`)

| Livello | Obiettivo | Sessione |
|---|---|---|
| zero, basics | qualunque | `zero` — percorso guidato |
| independent, business | Viaggi di lavoro | `essentials` |
| business | Trattative e clienti | `negotiation` |
| independent | Trattative e clienti | `mission` |
| tutti gli altri | — | `text-2` / `text-5` / `guided` secondo i minuti |

**Override calendario:** se esiste un impegno oggi o domani, vince lui e la
sessione diventa il riscaldamento per quell'impegno.

La regola che i test proteggono per prima: **un principiante non riceve mai una
trattativa da recitare.**

## Le quattro decisioni chiuse

1. Percorso fisso a 90 giorni per tutti.
2. La prima sessione è sempre gratuita, anche a prova esaurita.
3. «Simulazione trattativa» costruita col prompt di Sam — modalità
   `negotiation` in `src/lib/ai/prompt.ts`, non un fallback.
4. Durata più vicina disponibile se il motore non è parametrico.

## Prima del deploy

```
npm run db:migrate
```

La `0023` aggiunge due colonne. Senza, la home e l'onboarding falliscono in
lettura.

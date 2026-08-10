# ExecLingo — Kit schede store (Google Play + App Store)

Materiale pronto da incollare quando l'account sviluppatore è operativo.
Screenshot: già pronti (5, formato 1080×1920). AAB Android: ExecLingo-PlayStore.aab (firmato).

---

## GOOGLE PLAY

**Nome app** (max 30 caratteri):
```
ExecLingo: inglese business
```

**Descrizione breve** (max 80 caratteri):
```
Il coach AI di inglese per chi lavora. Bastano anche 2 minuti al giorno.
```

**Descrizione completa** (max 4000 caratteri):
```
In 3 mesi sei operativo in inglese.

ExecLingo è il coach di inglese con intelligenza artificiale pensato per manager, professionisti e imprenditori: si adatta al tuo livello e soprattutto al tempo che hai davvero, anche solo 2 minuti tra una riunione e l'altra.

IL TUO COACH PERSONALE: SAM
Sam conversa con te per iscritto e a voce, ti corregge con garbo e ricorda i tuoi progressi. Niente lezioni fisse, niente esercizi da scuola: parli di lavoro vero, dal primo minuto.

COSTRUITO PER CHI LAVORA
• Business Mission — simulazioni di riunioni, trattative, presentazioni e telefonate
• Meeting Warm-up — 5 minuti di riscaldamento mirato prima di una call in inglese
• English Rescue — scrivi in italiano la frase che ti serve ADESSO: la ottieni in inglese, con l'audio
• Listen + Type — ascolti in inglese e rispondi scrivendo: perfetto in treno o in open space
• Inglese per i viaggi — aeroporti, hotel, ristoranti, networking

SI ADATTA AL TUO TEMPO
Scegli quanto tempo hai: 2, 5 o 20 minuti. Il coach costruisce la sessione giusta e riprende esattamente da dove avevi lasciato. Le notifiche intelligenti ti propongono il momento giusto, senza assillarti.

IL PERCORSO DI 3 MESI
Parti da un test del livello di 3 minuti (gratuito, senza voti e senza esami) e segui il 3-Month Executive Path: un percorso costruito sui tuoi obiettivi, con progressi misurati su capacità reali — le riunioni che gestisci, le call che guidi — non su punteggi astratti.

PER LE AZIENDE
Licenze per team con sconti a scaglioni e fatturazione: la tua azienda compra i codici, i dipendenti li attivano. Tutto self-service su execlingo.it/aziende.

Creata da CEO, dirigenti e quadri d'azienda. Un servizio VASP ITALIA SRL.
Il test del livello è gratuito. Le funzionalità complete richiedono un abbonamento (prezzi IVA inclusa, pagamenti sicuri via Stripe).

Assistenza: ug@vaspitalia.com · Privacy: https://www.execlingo.it/privacy
```

**Impostazioni scheda**
- Categoria: Istruzione
- Tag: Apprendimento delle lingue
- Email di contatto: ug@vaspitalia.com
- Sito web: https://www.execlingo.it
- Privacy policy: https://www.execlingo.it/privacy

**Questionario "Sicurezza dei dati" (Data safety)** — risposte da selezionare:
- Raccoglie dati? SÌ
  - Informazioni personali → Indirizzo email, Nome: raccolti, associati all'utente, per funzionalità dell'app (account). Non condivisi a fini pubblicitari.
  - Audio → Registrazioni vocali: raccolte SOLO per la funzionalità (conversazione col coach), elaborate e non usate per pubblicità.
  - Info finanziarie: NO (i pagamenti sono gestiti da Stripe, l'app non vede i dati carta).
- Dati criptati in transito? SÌ
- L'utente può chiedere la cancellazione? SÌ (dal profilo / via email)
- App destinata ai minori? NO

**Classificazione contenuti**: questionario IARC → categoria "Riferimento, produttività o istruzione", nessun contenuto sensibile → esito atteso PEGI 3.

**Prezzi**: app gratuita con acquisti in-app esterni (abbonamento via sito — modello reader/service).

---

## APP STORE (App Store Connect)

**Nome** (max 30): `ExecLingo`
**Sottotitolo** (max 30): `Inglese business con coach AI`

**Parole chiave** (max 100 caratteri, senza spazi dopo le virgole):
```
inglese,business,coach,AI,conversazione,meeting,lavoro,viaggio,corso,parlare,ascolto,executive
```

**Descrizione**: usare lo stesso testo della descrizione completa Google Play (senza la riga finale assistenza/privacy, che su App Store va nei campi dedicati).

**Testo promozionale** (max 170, modificabile senza nuova review):
```
In 3 mesi sei operativo in inglese: riunioni, call e trasferte. Il test del livello è gratis e dura 3 minuti.
```

**URL**
- Support URL: https://www.execlingo.it
- Marketing URL: https://www.execlingo.it
- Privacy Policy URL: https://www.execlingo.it/privacy

**App Privacy (etichette)** — dichiarare:
- Dati collegati all'utente: Email, Nome (account); Audio (funzionalità coach); Cronologia d'uso (progressi).
- Nessun dato usato per tracciamento pubblicitario. Pagamenti: gestiti fuori app da Stripe.

**Categoria**: Istruzione (primaria), Produttività (secondaria)
**Classificazione**: 4+
**Accesso per la review**: fornire un account demo (usare uno dei Test 1–5) con nota:
```
Demo account provided. The 3-minute level check is free; full training
requires a plan — the demo account has full access enabled.
```

---

## Promemoria tecnici post-pubblicazione
1. Play: copiare lo SHA-256 da "Firma dell'app" → impostare ASSETLINKS_SHA256 su Vercel (aggancio dominio).
2. Impostare APP_STORE_URL e PLAY_STORE_URL su Vercel → i badge compaiono su /scarica e /app smista agli store.
3. Play: closed test 12 tester × 14 giorni (account personale) prima della produzione.

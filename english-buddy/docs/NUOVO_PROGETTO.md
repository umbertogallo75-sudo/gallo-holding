# Da ExecLingo a un coach multi-materia — cosa portarti dietro

Documento di passaggio, scritto per essere **incollato all'apertura di una nuova
sessione Cowork**. Serve a non ripetere a voce quello che qui è già stato deciso,
costruito e — in qualche caso — sbagliato e corretto.

Aggiornato: 10 settembre 2026.

---

## 1. Sì, apri una chat nuova

Questa sessione è lunghissima e interamente tarata su ExecLingo: repo, branch,
credenziali, decisioni di prodotto. Tenere due prodotti nella stessa
conversazione significa che ogni richiesta su uno si porta dietro il contesto
dell'altro, e prima o poi qualcosa finisce nel posto sbagliato.

Quello che **non** vuoi è ricominciare da zero. Per questo esiste questo file.

---

## 2. Il modo di lavorare — riusalo identico

Ha funzionato per mesi. Non c'è ragione di reinventarlo.

**Il ciclo, prima di ogni pubblicazione**

```
npx tsc --noEmit && npx eslint . && npm test -- --run && npm run build
```

Se uno dei quattro fallisce, non si spedisce. Nessuna eccezione: in questo
progetto ogni volta che si è saltato un passaggio, il difetto è arrivato agli
utenti.

**Due repository, non uno**

- il repo di lavoro, dove si sviluppa su un branch dedicato
- il repo che la piattaforma di hosting costruisce, che riceve solo il
  sottoalbero dell'app

Uno script di allineamento copia il primo sul secondo. Serve perché il repo di
lavoro contiene anche altro, e perché il deploy non deve dipendere dalla
struttura interna.

**Verificare in produzione, sempre**

Dopo ogni pubblicazione, interrogare l'indirizzo reale finché non risponde come
deve. Due trappole già pagate:

- una pagina che risponde **307** non è rotta: sta mandando al login
- una pagina riservata risponde **404** a chi non è connesso, se non è stata
  registrata fra le sezioni note — e sembra identica a una pagina mai pubblicata

**Test che tengono insieme due elenchi**

Il progetto ha diversi test il cui unico scopo è impedire che due liste che
devono coincidere si separino in silenzio: i nomi degli eventi inviati dal
browser e quelli accettati dal server, i prezzi mostrati e quelli addebitati, le
sezioni riservate e quelle note al proxy, le pagine dichiarate e quelle che
esistono davvero. Costano dieci righe e hanno intercettato bug reali ogni volta.
**Adottali dal primo giorno.**

---

## 3. Cosa è riusabile quasi tal quale

Questa è la parte che vale mesi di lavoro. Nel nuovo progetto va copiata e
adattata, non riprogettata.

| Pezzo | Cosa fa | Quanto cambia |
|---|---|---|
| **Accesso** | codice via email, Google, Apple | niente |
| **Pagamenti** | Stripe via REST, senza SDK; piani, prova gratuita, diritti d'accesso | niente |
| **Licenze a pacchetto** | un ente compra N codici, ognuno ne attiva uno | **moltissimo valore**: diventa la scuola che compra per la classe |
| **Prova gratuita** | 7 giorni automatici alla registrazione | niente |
| **Notifiche** | web push, APNs, FCM, fasce orarie, recupero | niente |
| **Email** | invio, ricezione, disiscrizione, preferenze | niente |
| **Analitica di funnel** | eventi, attribuzione, provenienza campagne | niente |
| **Involucri iOS e Android** | l'app è un contenitore del sito | niente |
| **Motore di apprendimento** | profilo, errori, espressioni, ripasso a intervalli, livelli | la struttura resta, il contenuto no |
| **La palestra** | sei esercizi a tempo con audio | **la struttura è perfetta**, gli esercizi cambiano per materia |
| **Amministrazione** | ricerca utente, cancellazione GDPR | niente |
| **Programma referral** | link personale, commissione | niente |

Il punto più importante: **il fatto che l'app sia un involucro del sito**. Una
regressione lato nativo si neutralizza dal web e arriva a tutti in minuti, senza
una nuova build né la revisione degli store. In questo progetto ha salvato le
chiamate vocali.

---

## 4. Cosa va ripensato da zero

- **Il modello dei contenuti.** ExecLingo ha una sola competenza. Un coach
  scolastico ne ha decine, ordinate per materia, anno e programma ministeriale.
  È la differenza architetturale principale.
- **Chi paga e chi usa.** Qui coincidono. Lì quasi mai: paga un genitore o una
  scuola, usa uno studente.
- **La stagionalità.** L'inglese si impara tutto l'anno. Le materie scolastiche
  hanno picchi feroci — settembre, gennaio, giugno — e mesi morti.
- **Il tono.** «Sam» parla a un dirigente. A un quattordicenne serve un'altra
  voce, e ai suoi genitori un'altra ancora.

---

## 5. Il vincolo che cambierà più cose di quante pensi: i minorenni

Vale la pena saperlo **prima** di disegnare qualsiasi cosa.

- **Consenso.** In Italia il consenso digitale autonomo scatta a **14 anni**
  (GDPR art. 8, soglia nazionale). Sotto, serve il consenso di chi esercita la
  responsabilità genitoriale. Questo non è un banner: è un flusso di
  registrazione diverso, con un adulto verificabile nel mezzo.
- **Store.** Un'app rivolta ai minori entra in categorie con regole proprie su
  raccolta dati, pubblicità e collegamenti esterni. La classificazione per età
  cambia cosa puoi mostrare e cosa puoi tracciare.
- **Pubblicità.** Le piattaforme limitano fortemente il targeting dei minori.
  La promozione andrà rivolta **ai genitori e ai docenti**, non agli studenti —
  il che cambia i canali, i messaggi e le landing page.
- **Dati.** Meno se ne raccolgono, meglio è. Ogni campo va giustificato.

Non è un ostacolo insormontabile — è un requisito da mettere nelle fondamenta,
perché aggiungerlo dopo costa dieci volte.

---

## 6. Le regole che ti sei dato — riportale identiche

Sono state scritte una alla volta, quasi sempre dopo un rischio corso davvero.

- **Nessun agente inserisce mai credenziali, IBAN, codici fiscali, date di
  nascita o spunta dichiarazioni sotto responsabilità.** Quelle le fai tu.
- **Nessun segreto passa dalla chat.** Chiavi, token e password vanno da dove
  nascono a dove servono, senza tappe intermedie.
- **Nessun agente genera, legge o copia un token.** Prepara fino al punto in cui
  comparirebbe un segreto, e si ferma.
- **La pagina delle variabili d'ambiente non si apre mai** per leggere o
  riportare: contiene chiavi di pagamento, database e cron.
- **Nessuna pubblicazione autonoma** sugli store: revisioni, rollout e prezzi
  sono click tuoi.
- **Mai accettare accordi di licenza per conto tuo.**

---

## 7. Le lezioni pagate care

Da rileggere prima di scrivere codice, non dopo.

1. **Una percentuale dentro `translate` si calcola sull'elemento, non sul
   contenitore.** Ha reso ingiocabile un gioco intero.
2. **La classe che definisce i colori va applicata a qualcosa.** Un tema può
   essere scritto perfettamente e non esistere.
3. **Il tema ha tre stati, non due**: segui il sistema, chiaro esplicito, scuro
   esplicito. Dichiararne uno solo lascia metà utenti con i colori sbagliati.
4. **Non calcolare punteggi dentro un aggiornamento di stato React**: può
   essere eseguito due volte.
5. **La geometria e le regole dentro il markup non si possono testare.** Se una
   cosa può sbagliare, deve stare in una funzione pura.
6. **Dopo ogni versione approvata dagli store, alza il numero di versione prima
   della build successiva**, o la build viene rifiutata.
7. **Prima di allineare i repository, controlla che nessun altro abbia
   pubblicato nel frattempo**, o si sovrascrive lavoro altrui.
8. **Un test scritto guardando il codice invece della documentazione** congela
   il bug invece di trovarlo.
9. **Quando la verifica dice che è rotto, sospetta prima la verifica.** Un 307
   non è un errore, e un 404 su una pagina riservata è una configurazione
   mancante, non un deploy fallito.
10. **Le informazioni fiscali e legali su una pagina commerciale** vanno scritte
    con la condizione accanto all'affermazione, datate, e fatte leggere a un
    professionista prima di pubblicare.

---

## 8. Le decisioni da prendere prima di aprire la chat

Rispondere a queste otto domande fa risparmiare la prima ora di conversazione.

1. **Nome e dominio.** Servono per il repo, gli store e le email.
2. **Repository nuovo o cartella accanto a ExecLingo?** Consiglio: nuovo repo,
   stessa struttura, così i due prodotti non si intralciano.
3. **Ambito iniziale.** Medie, superiori e università insieme sono tre prodotti.
   Consiglio: partire da **uno solo** e allargare. Il candidato migliore è
   quello dove il dolore è più acuto e chi paga decide più in fretta.
4. **Materie del primo rilascio.** Due o tre, non dodici.
5. **Chi paga.** Genitore, studente maggiorenne, scuola. Cambia il prodotto,
   non solo il pagamento.
6. **Account condivisi o separati** per pagamenti, email, notifiche e store.
   Consiglio: **email e notifiche separate** (dominio diverso), **pagamenti**
   valuta con il commercialista se stessa società.
7. **L'hosting.** Vedi sotto: è un problema concreto e immediato.
8. **La voce del coach.** Nome, età percepita, come dà torto a uno studente.

---

## 9. Un problema pratico da risolvere *prima*

L'account di hosting attuale è sul piano gratuito ed è già **al 57% del monte
calcolo mensile con tre settimane davanti**. Ci sono inoltre **due progetti che
costruiscono lo stesso repository**, il che raddoppia il consumo senza alcun
beneficio: uno va eliminato.

Un secondo prodotto sullo stesso account **non ci sta**. Da decidere prima di
cominciare: passare a un piano a pagamento, oppure un account separato per il
nuovo progetto. È una scelta da cinque minuti che, se rimandata, si presenta
come un sito che smette di rispondere nel momento peggiore.

---

## 10. Da incollare nella nuova chat

> Sto avviando un nuovo prodotto: un coach didattico multi-materia per studenti
> italiani, sul modello di ExecLingo (coach d'inglese che ho già in produzione
> su iOS, Android e web).
>
> Prima di scrivere codice voglio impostare bene tre cose: il modello dei
> contenuti per più materie, il flusso di registrazione con il consenso dei
> genitori per gli under 14, e quale parte dell'infrastruttura di ExecLingo
> conviene copiare invece di riscrivere.
>
> Ti allego il documento di passaggio scritto alla fine del lavoro su ExecLingo:
> contiene il modo di lavorare, cosa è riusabile, le regole di sicurezza che
> applico e gli errori già pagati. Leggilo prima di propormi qualsiasi cosa, e
> poi fammi le domande che ti servono davvero.
>
> [allega docs/NUOVO_PROGETTO.md]

---

## 11. Cosa resta aperto qui su ExecLingo

Perché non si perda nel passaggio.

- Token Meta e credenziali TikTok da generare (solo tu)
- Android da 10% a 100% dopo il controllo dei vitals
- Misurazione delle coorti della prova gratuita — era la priorità del report di
  marketing e non è ancora fatta
- Eliminare il progetto di hosting duplicato
- Taratura dei tempi della palestra dopo le tue prove

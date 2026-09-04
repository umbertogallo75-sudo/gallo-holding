import Link from "next/link";
import { SitePage } from "@/components/SitePage";

export const metadata = { title: "Privacy · ExecLingo" };

/**
 * Informativa privacy (artt. 13-14 GDPR).
 *
 * Written from the code, like the cookie policy next to it: every purpose,
 * every processor and every retention period below is something the running
 * application actually does. A notice that describes a different service from
 * the one deployed is the most common defect there is and the easiest to be
 * caught on — and after the marketing emails were added, this page was
 * describing a service that no longer existed.
 *
 * The legal bases are stated per purpose because that is the part a notice
 * exists for: without them the page is a description, not an informativa.
 */
const P = { margin: "0 0 10px" };

export default function PrivacyPage() {
  return (
    <SitePage>
      <section className="hero">
        <div className="kicker">Informativa privacy</div>
        <h1>I tuoi dati, in chiaro.</h1>
        <p className="muted">Ai sensi degli artt. 13 e 14 del Regolamento (UE) 2016/679 · Ultimo aggiornamento: 4 settembre 2026</p>
      </section>

      <section className="card">
        <h2>1. Chi tratta i tuoi dati</h2>
        <p style={P}>Titolare del trattamento è <strong>VASP ITALIA SRL</strong>, Via M. Schipa 22, 80122 Napoli (NA), P.IVA e C.F. 03463400634, PEC <a href="mailto:vasp@pec.it">vasp@pec.it</a>. ExecLingo è un servizio di VASP ITALIA SRL.</p>
        <p style={P}>Per ogni richiesta relativa ai tuoi dati, incluso l&rsquo;esercizio dei diritti al punto 8: <a href="mailto:ug@vaspitalia.com">ug@vaspitalia.com</a>.</p>
        <p className="muted" style={{ margin: 0 }}>Non è stato nominato un Responsabile della protezione dei dati (DPO): il trattamento non rientra nei casi in cui l&rsquo;art. 37 GDPR lo rende obbligatorio.</p>
      </section>

      <section className="card">
        <h2>2. Quali dati trattiamo</h2>
        <p style={P}><strong>Dati dell&rsquo;account.</strong> Nome, indirizzo email e credenziali di accesso. La password è conservata solo in forma cifrata e non è leggibile da nessuno, noi compresi. Se accedi con Google o Apple riceviamo da loro nome ed email, non la tua password.</p>
        <p style={P}><strong>Dati di apprendimento.</strong> Le conversazioni con il coach (scritte e vocali), gli errori ricorrenti, le espressioni imparate, il livello stimato e i progressi giornalieri. Sono il cuore del servizio: senza di essi il coach non può adattarsi a te.</p>
        <p style={P}><strong>Dati di utilizzo.</strong> Quando apri l&rsquo;app, quanti minuti ti alleni, quali attività usi, se completi il percorso iniziale.</p>
        <p style={P}><strong>Notifiche.</strong> Se le attivi, l&rsquo;identificativo del tuo dispositivo per l&rsquo;invio push.</p>
        <p style={P}><strong>Dati di pagamento.</strong> Se acquisti un piano, trattiamo lo stato dell&rsquo;abbonamento e l&rsquo;identificativo cliente del gestore dei pagamenti. <strong>I dati della carta non transitano mai dai nostri sistemi</strong>: sono raccolti direttamente da Stripe, Apple o Google.</p>
        <p style={P}><strong>Dati di navigazione e provenienza.</strong> Eventi tecnici (visite alle pagine pubbliche, registrazioni, acquisti) e il canale da cui sei arrivato la prima volta. Il dettaglio dei cookie è nella <Link href="/cookie">cookie policy</Link>.</p>
        <p style={{ margin: 0 }}><strong>Dati relativi alle email.</strong> Se ti scriviamo, registriamo quale messaggio ti è stato inviato e quando, e se hai chiesto di non riceverne più.</p>
      </section>

      <section className="card">
        <h2>3. Perché li trattiamo, e con quale base giuridica</h2>
        <p className="muted" style={P}>Ogni trattamento ha una sola finalità e una base giuridica dichiarata. Dove la base è il consenso puoi revocarlo quando vuoi; dove è il legittimo interesse puoi opporti.</p>
        <div style={{ overflowX: "auto" }}>
          <table className="adminTable">
            <thead><tr><th>Finalità</th><th>Base giuridica</th><th>Se ti opponi</th></tr></thead>
            <tbody>
              <tr>
                <td>Creare e gestire il tuo account, farti accedere</td>
                <td>Esecuzione del contratto — <strong>art. 6.1.b</strong></td>
                <td>Il servizio non può essere erogato</td>
              </tr>
              <tr>
                <td>Far funzionare il coach e <strong>adattare le lezioni al tuo livello</strong> in base ai tuoi errori e ai tuoi progressi</td>
                <td>Esecuzione del contratto — <strong>art. 6.1.b</strong></td>
                <td>Il servizio non può essere erogato</td>
              </tr>
              <tr>
                <td>Inviarti le <strong>notifiche push</strong> di allenamento</td>
                <td>Consenso — <strong>art. 6.1.a</strong> (le attivi tu)</td>
                <td>Le disattivi dal telefono o dal profilo</td>
              </tr>
              <tr>
                <td>Inviarti <strong>email sul tuo percorso</strong>: benvenuto, promemoria se non ti alleni, riepilogo dei tuoi progressi</td>
                <td>Legittimo interesse — <strong>art. 6.1.f</strong>: farti usare il servizio che hai richiesto</td>
                <td><strong>Un clic in fondo a ogni email</strong> e smettiamo, senza doverci scrivere</td>
              </tr>
              <tr>
                <td>Inviarti <strong>email su ExecLingo</strong> e sulle sue novità</td>
                <td>Legittimo interesse — <strong>art. 6.1.f</strong>, nei limiti dell&rsquo;art. 130 c. 5 del Codice Privacy</td>
                <td><strong>Lo stesso clic</strong>: vale per tutte</td>
              </tr>
              <tr>
                <td>Gestire acquisti, abbonamenti e adempimenti fiscali</td>
                <td>Contratto — <strong>art. 6.1.b</strong> e obbligo di legge — <strong>art. 6.1.c</strong></td>
                <td>Non è possibile: la legge ci obbliga a conservare i documenti fiscali</td>
              </tr>
              <tr>
                <td>Capire, in forma aggregata, come viene usato il servizio e da quali canali arrivano le persone</td>
                <td>Legittimo interesse — <strong>art. 6.1.f</strong>. Per i cookie di terze parti: <strong>consenso</strong></td>
                <td>Rifiuti dal banner, o revochi dalla <Link href="/cookie">cookie policy</Link></td>
              </tr>
              <tr>
                <td><strong>Mail che ci inoltri tu</strong>: leggerle, riassumerle e prepararti una risposta in inglese</td>
                <td>Esecuzione del contratto — <strong>art. 6.1.b</strong>, su tua richiesta espressa: il trattamento inizia solo quando inoltri un messaggio</td>
                <td>Non inoltrare nulla, oppure elimina una mail già inoltrata: sparisce subito</td>
              </tr>
              <tr>
                <td>Sicurezza, prevenzione degli abusi, difesa in giudizio</td>
                <td>Legittimo interesse — <strong>art. 6.1.f</strong></td>
                <td>Valutiamo caso per caso</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="itHint" style={{ marginBottom: 0 }}>Il conferimento dei dati dell&rsquo;account è necessario per usare ExecLingo. Tutto il resto è facoltativo e il rifiuto non ti preclude il servizio.</p>
      </section>

      <section className="card">
        <h2>4. Personalizzazione e decisioni automatiche</h2>
        <p style={P}>ExecLingo <strong>si adatta a te automaticamente</strong>, ed è giusto che tu sappia come. Un sistema di intelligenza artificiale stima il tuo livello dalle tue risposte, sceglie gli esercizi successivi, decide quali espressioni riproporti e quando, e stabilisce se e quando scriverti — per esempio se non ti alleni da qualche giorno, o la sera in cui ti sei allenato almeno dieci minuti.</p>
        <p style={P}>Si tratta di profilazione ai sensi dell&rsquo;art. 4.4 GDPR, limitata al percorso di apprendimento. <strong>Non produce effetti giuridici né incide in modo analogamente significativo sulla tua persona</strong> ai sensi dell&rsquo;art. 22 GDPR: non determina prezzi, non condiziona l&rsquo;accesso al servizio e non viene comunicata a terzi.</p>
        <p style={{ margin: 0 }}>Puoi opporti in qualsiasi momento scrivendoci; per le email basta il link in fondo a ciascuna.</p>
      </section>

      <section className="card">
        <h2>5. Chi tratta i dati</h2>
        <p className="muted" style={P}>Ci affidiamo a fornitori tecnici nominati responsabili del trattamento quando applicabile. I gestori di pagamento, accesso e pubblicità possono agire come titolari autonomi per i trattamenti descritti nelle rispettive informative.</p>
        <div style={{ overflowX: "auto" }}>
          <table className="adminTable">
            <thead><tr><th>Fornitore</th><th>Cosa fa</th><th>Dove</th></tr></thead>
            <tbody>
              <tr><td><strong>OpenAI</strong></td><td>Elabora le conversazioni con il coach e le trascrive. Secondo i termini API, i dati <strong>non</strong> sono usati per addestrare i modelli.</td><td>USA</td></tr>
              <tr><td><strong>Vercel</strong></td><td>Ospita l&rsquo;applicazione.</td><td>UE / USA</td></tr>
              <tr><td><strong>Turso</strong></td><td>Ospita il database.</td><td>UE / USA</td></tr>
              <tr><td><strong>Resend</strong></td><td>Recapita le email (registrazione, recupero password, percorso) e riceve quelle che inoltri tu.</td><td>UE (Irlanda)</td></tr>
              <tr><td><strong>Stripe</strong></td><td>Incassa i pagamenti sul web. Titolare autonomo per i dati della carta.</td><td>USA</td></tr>
              <tr><td><strong>Apple</strong> · <strong>Google</strong></td><td>Acquisti in app, accesso con Apple/Google, notifiche push, distribuzione delle app.</td><td>USA</td></tr>
              <tr><td><strong>Google</strong> · <strong>Meta</strong> · <strong>LinkedIn</strong> · <strong>TikTok</strong></td><td>Misurazione delle campagne pubblicitarie e remarketing — <strong>solo se acconsenti ai cookie</strong>.</td><td>USA / Singapore</td></tr>
            </tbody>
          </table>
        </div>
        <p style={{ margin: "12px 0 0" }}><strong>Trasferimenti fuori dall&rsquo;Unione Europea.</strong> Alcuni fornitori trattano dati negli Stati Uniti. Il trasferimento avviene sulla base delle <strong>Clausole Contrattuali Standard</strong> approvate dalla Commissione europea (art. 46.2.c GDPR) e, dove applicabile, dell&rsquo;adesione del fornitore al <strong>Data Privacy Framework UE-USA</strong> (art. 45 GDPR). Puoi chiederci copia delle garanzie adottate.</p>
        <p style={{ margin: "10px 0 0" }}><strong>Non vendiamo i tuoi dati.</strong> Google, Meta, LinkedIn e TikTok, solo se hai acconsentito, possono ricevere dati tecnici della visita e il fatto che una registrazione o un acquisto è avvenuto. Non inviamo il tuo nome, la tua email, le conversazioni con il coach o i dati di apprendimento; non abilitiamo la corrispondenza avanzata tramite email.</p>
      </section>

      <section className="card">
        <h2>6. Per quanto li conserviamo</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="adminTable">
            <thead><tr><th>Dato</th><th>Conservazione</th></tr></thead>
            <tbody>
              <tr><td>Account e dati di apprendimento</td><td>Finché l&rsquo;account è attivo. Cancellazione su richiesta <strong>entro 30 giorni</strong>.</td></tr>
              <tr><td>Conversazioni con il coach</td><td>Con l&rsquo;account. Eliminate insieme a esso.</td></tr>
              <tr><td>Registro delle email inviate</td><td>Con l&rsquo;account.</td></tr>
              <tr><td><strong>Testo delle mail che ci inoltri</strong></td><td><strong>30 giorni</strong>, poi viene cancellato automaticamente. Restano il riassunto e la risposta, finché non li elimini tu o cancelli l&rsquo;account.</td></tr>
              <tr><td>Registro dei consensi ai cookie</td><td>180 giorni dalla scelta, o fino alla revoca.</td></tr>
              <tr><td>Documenti fiscali di acquisto</td><td><strong>10 anni</strong>, come impone la legge italiana.</td></tr>
              <tr><td>Provvigioni e pagamenti partner</td><td>Per il tempo necessario a saldare quanto dovuto e, per i registri contabili e fiscali, fino a <strong>10 anni</strong>. Alla cancellazione dell&rsquo;account il profilo ordinario viene rimosso e i riferimenti tecnici vengono sostituiti dove possibile.</td></tr>
              <tr><td>Richiesta di non ricevere più email</td><td><strong>A tempo indeterminato, come impronta pseudonimizzata SHA-256.</strong> Vedi sotto.</td></tr>
            </tbody>
          </table>
        </div>
        <p style={{ margin: "12px 0 0" }}><strong>Perché la disiscrizione ci sopravvive.</strong> Se cancelli l&rsquo;account cancelliamo anche la preferenza collegata al profilo. Se poi lo stesso indirizzo tornasse, senza una memoria separata ricominceremmo a scrivere come se non avessi mai detto niente. Per evitarlo conserviamo <strong>un&rsquo;impronta SHA-256 normalizzata dell&rsquo;indirizzo</strong>: non contiene l&rsquo;email in chiaro e non può essere usata da sola per inviare messaggi, ma permette il confronto quando un indirizzo già noto viene ripresentato. Non la consideriamo anonima: è un dato pseudonimizzato, protetto e usato esclusivamente per rispettare l&rsquo;opposizione.</p>
      </section>

      <section className="card">
        <h2>6-bis. Le mail che ci inoltri</h2>
        <p style={P}>Puoi inoltrare a Sam una mail scritta in inglese e ricevere in cambio cosa dice, cosa ti stanno chiedendo e una risposta pronta. È una funzione <strong>facoltativa e sempre spenta finché non la usi</strong>: non leggiamo la tua casella di posta, non abbiamo accesso al tuo account di posta e non possiamo prelevare nulla. Tratteremo esclusivamente i messaggi che ci mandi tu, uno per uno.</p>
        <p style={P}><strong>Il punto delicato, detto chiaramente.</strong> Una mail di lavoro contiene quasi sempre dati di altre persone — chi te l&rsquo;ha scritta, chi è in copia, di chi si parla. Per quei dati il titolare del trattamento resti tu o la tua azienda: noi li trattiamo come <strong>responsabili</strong>, solo per produrre il riassunto e la risposta che hai chiesto, per il tempo indicato sopra, e per nient&rsquo;altro. Prima di inoltrare valuta se il contenuto è coperto da segreto professionale o da un obbligo di riservatezza verso il tuo cliente o la tua azienda: quella valutazione possiamo solo ricordartela, non farla al posto tuo.</p>
        <p style={P}><strong>Cosa non facciamo.</strong> Non usiamo queste mail per addestrare modelli — né noi né il fornitore che elabora il testo, secondo i termini API che ci vincolano. Non le leggiamo per finalità commerciali, non le usiamo per profilarti oltre il tuo percorso di inglese e non le comunichiamo a nessuno oltre ai fornitori tecnici già elencati.</p>
        <p style={{ margin: 0 }}><strong>Come si spegne.</strong> Il tuo indirizzo personale di inoltro può essere cambiato in qualsiasi momento dalla sezione <em>Le tue mail</em>: quello vecchio smette immediatamente di funzionare. Ogni mail può essere eliminata singolarmente, e con la cancellazione dell&rsquo;account spariscono tutte.</p>
      </section>

      <section className="card">
        <h2>7. Come li proteggiamo</h2>
        <p style={P}>Traffico cifrato (HTTPS) su tutto il servizio, password conservate solo come hash, accesso ai dati limitato a chi deve amministrarli, e nessuna copia dei dati della carta sui nostri sistemi.</p>
        <p style={{ margin: 0 }}>In caso di violazione dei dati che comporti un rischio elevato per i tuoi diritti, ti informeremo senza ingiustificato ritardo, come previsto dall&rsquo;art. 34 GDPR.</p>
      </section>

      <section className="card">
        <h2>8. I tuoi diritti</h2>
        <p style={P}>Ai sensi degli artt. 15-22 GDPR hai diritto di ottenere l&rsquo;<strong>accesso</strong> ai tuoi dati, la loro <strong>rettifica</strong> o <strong>cancellazione</strong>, la <strong>limitazione</strong> del trattamento, la <strong>portabilità</strong> in formato leggibile, e di <strong>opporti</strong> al trattamento fondato sul legittimo interesse.</p>
        <p style={P}><strong>Revoca del consenso (art. 7.3).</strong> Dove il trattamento si basa sul consenso puoi revocarlo in qualsiasi momento, con la stessa facilità con cui lo hai dato e senza pregiudicare quanto fatto prima. Per i cookie, dalla <Link href="/cookie">cookie policy</Link>. Per le notifiche, dal telefono. <strong>Per le email, dal link in fondo a ciascuna</strong>: un clic, senza password e senza spiegazioni.</p>
        <p style={P}>Scrivi a <a href="mailto:ug@vaspitalia.com">ug@vaspitalia.com</a>: rispondiamo entro un mese. La cancellazione completa dell&rsquo;account si richiede anche dalla pagina <Link href="/elimina-account">Elimina account</Link>.</p>
        <p style={{ margin: 0 }}><strong>Reclamo.</strong> Puoi rivolgerti al <strong>Garante per la protezione dei dati personali</strong> (Piazza Venezia 11, 00187 Roma — <a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer">garanteprivacy.it</a>) o all&rsquo;autorità dello Stato UE in cui risiedi, oppure ricorrere all&rsquo;autorità giudiziaria.</p>
      </section>

      <section className="card">
        <h2>9. Minori</h2>
        <p style={{ margin: 0 }}>ExecLingo si rivolge a professionisti adulti e <strong>non è destinato a minori di 16 anni</strong>. Non raccogliamo consapevolmente dati di minori di quell&rsquo;età; se ci accorgiamo che è avvenuto, cancelliamo l&rsquo;account.</p>
      </section>

      <section className="card">
        <h2>10. Modifiche</h2>
        <p style={{ margin: 0 }}>Se cambiamo qualcosa di sostanziale aggiorniamo la data in cima e, quando la modifica riguarda finalità nuove o la base giuridica, te lo comunichiamo via email prima che abbia effetto.</p>
      </section>

      <p className="itHint" style={{ margin: "14px 4px 24px", textAlign: "center" }}>
        <Link href="/cookie">Cookie policy</Link> · <Link href="/termini">Termini di servizio</Link> · <Link href="/elimina-account">Elimina account</Link> · <Link href="/">Torna all&rsquo;inizio</Link>
      </p>
    </SitePage>
  );
}

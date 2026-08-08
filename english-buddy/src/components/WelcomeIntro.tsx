"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "buddy-welcome-seen";

/**
 * Two-page full-screen intro shown the first time the app opens on a device:
 * page 1 — the story and who it's for; page 2 — how it works, how to spend
 * your time, and how to install it as an app. Sits above the push banner
 * (z-index) so the flow is: welcome → notifications.
 */
export function WelcomeIntro() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<1 | 2>(1);

  useEffect(() => {
    (async () => {
      if (localStorage.getItem(SEEN_KEY) !== "1") setOpen(true);
    })();
  }, []);

  if (!open) return null;

  function start() {
    localStorage.setItem(SEEN_KEY, "1");
    setOpen(false);
  }

  const dots = (
    <div className="welcomeDots" aria-hidden="true">
      <span className={page === 1 ? "welcomeDot on" : "welcomeDot"} />
      <span className={page === 2 ? "welcomeDot on" : "welcomeDot"} />
    </div>
  );

  if (page === 1) {
    return (
      <div className="welcomeOverlay" role="dialog" aria-label="Benvenuto in English Buddy">
        <div className="welcomeInner">
          <div className="welcomeMark">🇬🇧</div>
          <div className="kicker">Il tuo coach personale</div>
          <h1>Benvenuto in English&nbsp;Buddy</h1>

          <p className="welcomeLead">
            <strong>English Buddy</strong> nasce da un&rsquo;idea di <strong>Umberto Gallo</strong>, imprenditore,
            CEO e dirigente d&rsquo;impresa, con un obiettivo preciso: creare il coach di inglese che avrebbe
            sempre voluto avere.
          </p>

          <p className="muted">
            Pensata per professionisti, manager, imprenditori e per chi ha poco tempo, l&rsquo;app ti aiuta a
            migliorare l&rsquo;inglese attraverso brevi interazioni distribuite durante la giornata, adattandosi
            ai tuoi ritmi e ai minuti che hai realmente a disposizione.
          </p>

          <div className="welcomeGrid">
            <div className="welcomeItem"><span className="modeIcon">💼</span><div><strong>Business reale</strong><p className="muted">Riunioni, negoziazioni, viaggi e vita quotidiana — niente esercizi scolastici.</p></div></div>
            <div className="welcomeItem"><span className="modeIcon">⏱️</span><div><strong>2 o 40 minuti</strong><p className="muted">Conversazioni, simulazioni e ascolto su misura del tempo che hai davvero.</p></div></div>
            <div className="welcomeItem"><span className="modeIcon">🎯</span><div><strong>Percorso personalizzato</strong><p className="muted">Per parlare con più sicurezza in call internazionali, meeting e trasferte.</p></div></div>
          </div>

          <div className="welcomeNote">
            <strong>In continua evoluzione.</strong> English Buddy è in continuo aggiornamento: si nutre delle
            esperienze e delle informazioni degli stessi manager che la utilizzano, e migliora ogni settimana.
          </div>

          <p className="welcomeQuote">Il tuo tempo è prezioso. Anche il tuo inglese dovrebbe esserlo.</p>

          {dots}
          <button className="primary full welcomeCta" onClick={() => setPage(2)}>Continua</button>
        </div>
      </div>
    );
  }

  return (
    <div className="welcomeOverlay" role="dialog" aria-label="Come funziona English Buddy">
      <div className="welcomeInner">
        <div className="welcomeMark">🧭</div>
        <div className="kicker">Come funziona</div>
        <h1>Il tuo inglese, a modo tuo</h1>

        <p className="muted">
          Apri l&rsquo;app quando hai un momento libero e scegli quanto tempo dedicarle: il coach fa il resto.
          Meglio più micro-sessioni durante la giornata che una lezione lunga una volta a settimana.
        </p>

        <div className="welcomeGrid">
          <div className="welcomeItem"><span className="modeIcon">✍︎</span><div><strong>Scegli il tempo, non la lezione</strong><p className="muted">2 o 5 minuti di conversazione, 20 minuti guidati, oppure &ldquo;Surprise me&rdquo;: decide il coach cosa ti serve oggi.</p></div></div>
          <div className="welcomeItem"><span className="modeIcon">☕︎</span><div><strong>Il Buddy ti scrive lui</strong><p className="muted">Attiva le notifiche: riceverai brevi domande in inglese nei momenti naturali della giornata. Rispondi quando vuoi.</p></div></div>
          <div className="welcomeItem"><span className="modeIcon">🧠</span><div><strong>Una memoria che si adatta</strong><p className="muted">L&rsquo;app ricorda i tuoi errori e le espressioni imparate e le ripropone al momento giusto. Conta la costanza, non la durata.</p></div></div>
          <div className="welcomeItem"><span className="modeIcon">🍽️</span><div><strong>Anche le basi, quando servono</strong><p className="muted">Ogni tanto il coach ti insegna parole essenziali per viaggiare, ordinare al ristorante e cavartela ovunque.</p></div></div>
        </div>

        <div className="welcomeNote">
          <strong>📲 English Buddy è un&rsquo;app: installala sul tuo dispositivo.</strong><br />
          Su <strong>iPhone</strong>: apri questo sito in Safari, tocca <strong>Condividi</strong> (il quadrato
          con la freccia) e poi <strong>&ldquo;Aggiungi alla schermata Home&rdquo;</strong>.<br />
          Su <strong>Android</strong>: in Chrome tocca il menu <strong>⋮</strong> e poi
          <strong> &ldquo;Installa app&rdquo;</strong>.<br />
          Da quel momento aprila sempre dall&rsquo;icona sulla Home: solo così riceverai le notifiche del Buddy.
        </div>

        {dots}
        <div className="welcomeRow">
          <button className="secondary" onClick={() => setPage(1)}>Indietro</button>
          <button className="primary full welcomeCta" style={{ marginTop: 0, flex: 1 }} onClick={start}>Inizia</button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "buddy-welcome-seen";

/**
 * Full-screen intro shown the first time the app opens on a device.
 * Sits above the push banner (z-index) so the flow is: welcome → notifications.
 */
export function WelcomeIntro() {
  const [open, setOpen] = useState(false);

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

        <button className="primary full welcomeCta" onClick={start}>Inizia</button>
      </div>
    </div>
  );
}

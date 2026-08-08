"use client";

import { useEffect, useState } from "react";

const SHOWN_KEY = "buddy-splash-shown";

/**
 * Brand launch screen: shown once per app open while the shell connects and
 * updates in the background. Dismissed by a tap — "TAP PER AVVIARE".
 */
export function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (sessionStorage.getItem(SHOWN_KEY) !== "1") setVisible(true);
    })();
  }, []);

  if (!visible) return null;

  function dismiss() {
    if (leaving) return;
    sessionStorage.setItem(SHOWN_KEY, "1");
    setLeaving(true);
    setTimeout(() => setVisible(false), 420);
  }

  return (
    <div className={`splash ${leaving ? "splashLeave" : ""}`} onClick={dismiss} role="button" aria-label="Tap per avviare English Buddy" tabIndex={0}>
      <div className="splashSky" aria-hidden="true" />
      <div className="splashCenter">
        <div className="splashOrb" aria-hidden="true"><span>EB</span></div>
        <div className="splashWordmark">English&nbsp;Buddy</div>
        <div className="splashRule" aria-hidden="true" />
        <p className="splashTagline">Business English. On your time.</p>
        <p className="splashTaglineIt">Il coach d&rsquo;inglese pensato per chi non ha tempo.</p>
      </div>
      <div className="splashFooter">
        <div className="splashLoading" aria-hidden="true"><span /><span /><span /></div>
        <div className="splashCta">TAP PER AVVIARE</div>
        <div className="splashBy">by Umberto Gallo</div>
      </div>
    </div>
  );
}

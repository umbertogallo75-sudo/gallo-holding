"use client";

import { useEffect, useState } from "react";

const SHOWN_KEY = "buddy-splash-shown";
const SAM_KEY = "buddy-sam-intro-seen";

/**
 * Two-stage launch experience: the brand splash on every app open (tap to
 * start), then — the very first time on a device — Sam introduces himself
 * and throws down the 3-month challenge.
 */
export function SplashScreen() {
  const [stage, setStage] = useState<"hidden" | "splash" | "sam">("hidden");
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (sessionStorage.getItem(SHOWN_KEY) !== "1") setStage("splash");
    })();
  }, []);

  if (stage === "hidden") return null;

  // Sam introduces himself out loud: Italian first, then his English voice.
  // Called inside the tap handler so iOS unlocks speech synthesis.
  function speakSamIntro() {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const voices = synth.getVoices();
      const italian = new SpeechSynthesisUtterance(
        "Ciao, sono Sam, il tuo coach personale d'inglese. Dammi tre mesi, pochi minuti al giorno: riunioni, call e trasferte in inglese, senza paura."
      );
      italian.lang = "it-IT";
      const itVoice = voices.find((v) => v.lang.replace("_", "-").startsWith("it"));
      if (itVoice) italian.voice = itVoice;
      const english = new SpeechSynthesisUtterance(
        "Hi, I'm Sam, your personal English coach. Give me three months, a few minutes a day, and you'll be operational in English. Ready?"
      );
      english.lang = "en-US";
      const enVoice = voices.find((v) => v.lang.replace("_", "-").startsWith("en"));
      if (enVoice) english.voice = enVoice;
      synth.speak(italian);
      synth.speak(english);
    } catch {
      // No speech available — the written intro carries the message.
    }
  }

  function dismissSplash() {
    if (leaving) return;
    sessionStorage.setItem(SHOWN_KEY, "1");
    if (localStorage.getItem(SAM_KEY) !== "1") {
      speakSamIntro();
      setStage("sam");
      return;
    }
    setLeaving(true);
    setTimeout(() => setStage("hidden"), 420);
  }

  function dismissSam() {
    if (leaving) return;
    try { window.speechSynthesis?.cancel(); } catch { /* nothing to stop */ }
    localStorage.setItem(SAM_KEY, "1");
    setLeaving(true);
    setTimeout(() => setStage("hidden"), 420);
  }

  if (stage === "sam") {
    return (
      <div className={`splash ${leaving ? "splashLeave" : ""}`}>
        <div className="splashSky" aria-hidden="true" />
        <div className="splashCenter">
          <div className="splashOrb" aria-hidden="true"><span>S</span></div>
          <div className="samHello">Ciao, sono <strong>Sam</strong>.</div>
          <div className="splashRule" aria-hidden="true" />
          <p className="samLine">Il tuo coach personale d&rsquo;inglese. Mi adatto a te, ti scrivo durante il giorno e non ti faccio mai perdere tempo.</p>
          <div className="samPromise">
            🎯 Dammi <strong>3 mesi</strong>, pochi minuti al giorno:<br />
            riunioni, call e trasferte in inglese, <strong>senza paura</strong>.
          </div>
        </div>
        <div className="splashFooter">
          <button type="button" className="samReplay" onClick={speakSamIntro}>🔊 Riascolta Sam</button>
          <button type="button" className="samCta" onClick={dismissSam}>SFIDA ACCETTATA · INIZIA</button>
          <div className="splashBy">Sam is ready when you are</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`splash ${leaving ? "splashLeave" : ""}`} onClick={dismissSplash} role="button" aria-label="Tap per avviare English Buddy" tabIndex={0}>
      <div className="splashSky" aria-hidden="true" />
      <div className="splashCenter">
        <div className="splashOrb" aria-hidden="true"><span>EB</span></div>
        <div className="splashWordmark">English&nbsp;Buddy</div>
        <div className="splashRule" aria-hidden="true" />
        <p className="splashTagline">Business English. On your time.</p>
        <p className="splashTaglineIt">Segui Sam: in 3 mesi sei operativo in inglese.</p>
      </div>
      <div className="splashFooter">
        <div className="splashLoading" aria-hidden="true"><span /><span /><span /></div>
        <div className="splashCta">TAP PER AVVIARE</div>
        <div className="splashBy">by Umberto Gallo</div>
      </div>
    </div>
  );
}

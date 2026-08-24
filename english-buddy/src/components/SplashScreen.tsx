"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { tuneSamUtterance } from "@/lib/voice-prefs";
import { isPublicPage } from "@/lib/public-pages";

const SHOWN_KEY = "buddy-splash-shown";
const SAM_KEY = "buddy-sam-intro-seen";

/** How long the mark stays up before it gets out of the way, by itself. */
const LOADING_MS = 1500;
/** Length of the fade, matching the .splashLeave animation. */
const FADE_MS = 420;

/**
 * What this session's opening should be, read once from the device.
 *
 * It goes through useSyncExternalStore rather than an effect because the
 * answer never changes while the app is open, and setting state from inside
 * an effect to correct the first render is the cascade React asks us not to
 * write. The server always answers "skip": it cannot see the device, and an
 * overlay rendered on the server and removed on the client is a flash.
 */
function subscribe() {
  return () => {};
}

function openingSnapshot(): "skip" | "mark" | "mark+sam" {
  try {
    if (sessionStorage.getItem(SHOWN_KEY) === "1") return "skip";
    return localStorage.getItem(SAM_KEY) === "1" ? "mark" : "mark+sam";
  } catch {
    // Private mode with storage disabled: no opening rather than a stuck one.
    return "skip";
  }
}

const serverSnapshot = () => "skip" as const;

/**
 * The opening of the app: the mark while it loads, then — the very first time
 * on a device — Sam introducing himself.
 *
 * The mark used to be a door: it said TAP PER AVVIARE and waited. Testers
 * opened the app and did not know what to do, and a screen that demands a tap
 * before showing anything is the first place that feeling starts. Nobody taps
 * to enter an app they have already signed into; they just wanted to be in it.
 *
 * So it is now a loading screen and nothing more: it shows for at most a
 * second and a half and leaves on its own. Public pages never see it at all —
 * a visitor from an advertisement must land on what the ad promised.
 *
 * One consequence worth knowing: Sam's voice used to start inside the tap,
 * which is the only moment iOS allows speech to begin. Reaching his screen
 * without a tap means iOS will stay silent until the listener presses
 * "Riascolta Sam". The written introduction carries the same words, and the
 * first-run experience is being replaced by the guided onboarding anyway.
 */

export function SplashScreen() {
  const pathname = usePathname();
  const onPublicPage = isPublicPage(pathname);
  const opening = useSyncExternalStore(subscribe, openingSnapshot, serverSnapshot);
  const [stage, setStage] = useState<"mark" | "sam" | "hidden">("mark");
  const [leaving, setLeaving] = useState(false);
  const show = !onPublicPage && opening !== "skip";

  useEffect(() => {
    // Landing on a public page counts as the opening: a visitor who then signs
    // in must not meet the mark on the way to their home screen.
    if (onPublicPage) {
      try { sessionStorage.setItem(SHOWN_KEY, "1"); } catch { /* storage off */ }
      return;
    }
    if (!show) return;

    // One session, one opening: written now so a reload during the second and
    // a half does not bring the mark back.
    try { sessionStorage.setItem(SHOWN_KEY, "1"); } catch { /* storage off */ }

    let fade: ReturnType<typeof setTimeout> | undefined;
    const done = setTimeout(() => {
      if (opening === "mark+sam") {
        setStage("sam");
        return;
      }
      setLeaving(true);
      fade = setTimeout(() => setStage("hidden"), FADE_MS);
    }, LOADING_MS);

    return () => {
      clearTimeout(done);
      if (fade) clearTimeout(fade);
    };
  }, [show, onPublicPage, opening]);

  if (!show || stage === "hidden") return null;

  // Sam introduces himself out loud: Italian first, then his English voice.
  function speakSamIntro() {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const italian = tuneSamUtterance(
        new SpeechSynthesisUtterance(
          "Ciao, sono Sam, il tuo coach personale d'inglese. Dammi tre mesi, pochi minuti al giorno: riunioni, call e trasferte in inglese, senza paura."
        ),
        "it-IT",
        0.92
      );
      const english = tuneSamUtterance(
        new SpeechSynthesisUtterance(
          "Hi, I'm Sam, your personal English coach. Give me three months, a few minutes a day, and you'll be operational in English. Ready?"
        ),
        "en-US",
        0.92
      );
      synth.speak(italian);
      synth.speak(english);
    } catch {
      // No speech available — the written intro carries the message.
    }
  }

  function dismissSam() {
    if (leaving) return;
    try { window.speechSynthesis?.cancel(); } catch { /* nothing to stop */ }
    localStorage.setItem(SAM_KEY, "1");
    setLeaving(true);
    setTimeout(() => setStage("hidden"), FADE_MS);
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
          <div className="samHint">🎧 Tocca «Riascolta Sam» per sentirlo: alza il volume o metti le cuffie</div>
          <button type="button" className="samReplay" onClick={speakSamIntro}>🔊 Riascolta Sam</button>
          <button type="button" className="samCta" onClick={dismissSam}>SFIDA ACCETTATA · INIZIA</button>
          <div className="splashBy">Sam è pronto quando lo sei tu</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`splash ${leaving ? "splashLeave" : ""}`} role="status" aria-label="ExecLingo si sta aprendo">
      <div className="splashSky" aria-hidden="true" />
      <div className="splashCenter">
        <div className="splashOrb" aria-hidden="true"><span>EL</span></div>
        <div className="splashWordmark">ExecLingo</div>
        <div className="splashRule" aria-hidden="true" />
        <p className="splashTaglineIt">Segui Sam: in 3 mesi sei operativo in inglese.</p>
      </div>
      <div className="splashFooter">
        <div className="splashLoading" aria-hidden="true"><span /><span /><span /></div>
        {opening === "mark+sam" ? <div className="samHint">🎧 Sam sta per presentarsi</div> : null}
        <div className="splashBy">Creata da CEO, dirigenti e quadri d&rsquo;azienda</div>
      </div>
    </div>
  );
}

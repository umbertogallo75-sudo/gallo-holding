"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import {
  activeTagNames,
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_VERSION,
  consentCookieValue,
  hasMarketingTags,
  marketingTags,
  type ConsentChoice,
  type ConsentEvent,
} from "@/lib/consent";
import { consentServerSnapshot, consentSnapshot, notifyConsentChanged, subscribeConsent } from "@/lib/consent-store";

/** Guards against a second injection when the component remounts. */
let tagsLoaded = false;

/**
 * Loads the advertising tags. Only ever reached after an explicit yes, which
 * is why every Google consent purpose is set to granted here: the visitor has
 * already answered the question that signal exists to carry.
 */
function loadMarketingTags(): void {
  if (tagsLoaded) return;
  tagsLoaded = true;
  const { metaPixelId, googleAdsId } = marketingTags();

  if (googleAdsId) {
    const loader = document.createElement("script");
    loader.async = true;
    loader.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleAdsId)}`;
    document.head.appendChild(loader);

    const inline = document.createElement("script");
    inline.text =
      `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
      `gtag('js',new Date());` +
      `gtag('consent','default',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});` +
      `gtag('config',${JSON.stringify(googleAdsId)});`;
    document.head.appendChild(inline);
  }

  if (metaPixelId) {
    const inline = document.createElement("script");
    inline.text =
      `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?` +
      `n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;` +
      `n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;` +
      `t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}` +
      `(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');` +
      `fbq('init',${JSON.stringify(metaPixelId)});fbq('track','PageView');`;
    document.head.appendChild(inline);
  }
}

function remember(choice: ConsentChoice): void {
  const receipt = crypto.randomUUID();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(consentCookieValue(choice, receipt))}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  notifyConsentChanged();
  // The cookie already decided the outcome; the log is the proof of it, and a
  // network failure here must never reopen a question already answered.
  void logConsent(receipt, choice);
}

/** Records the choice server-side. Best effort, and silent about failure. */
export function logConsent(receipt: string, choice: ConsentEvent): Promise<void> {
  const body = JSON.stringify({ id: receipt, choice, policyVersion: CONSENT_VERSION, tags: activeTagNames() });
  return fetch("/api/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  })
    .then(() => undefined)
    .catch(() => undefined);
}

/**
 * Asks once, remembers for six months, and shows nothing at all when no
 * advertising tag is configured — which is the state of the app until the
 * first campaign starts. Sits below the content rather than over it: it is a
 * question, not a wall.
 */
export function ConsentBanner() {
  const state = useSyncExternalStore(subscribeConsent, consentSnapshot, consentServerSnapshot);

  useEffect(() => {
    if (state === "granted" && hasMarketingTags()) loadMarketingTags();
  }, [state]);

  if (state !== "unknown" || !hasMarketingTags()) return null;

  return (
    <div className="consentBar" role="region" aria-label="Preferenze sui cookie">
      <div className="consentInner">
        <p className="consentText">
          Usiamo cookie di <strong>terze parti</strong> (Google, Meta) per capire quali annunci portano persone davvero interessate.
          Sono facoltativi: se dici di no il sito funziona esattamente allo stesso modo.{" "}
          <Link href="/privacy">Come trattiamo i tuoi dati</Link>
        </p>
        <div className="consentBtns">
          <button type="button" className="consentBtn" onClick={() => remember("denied")}>Rifiuta</button>
          <button type="button" className="consentBtn consentBtnYes" onClick={() => remember("granted")}>Accetta</button>
        </div>
      </div>
    </div>
  );
}

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
  MARKETING_TAGS_READY_EVENT,
  marketingTags,
  type ConsentChoice,
  type ConsentEvent,
} from "@/lib/consent";
import { consentServerSnapshot, consentSnapshot, notifyConsentChanged, subscribeConsent } from "@/lib/consent-store";
import { safeGa4PageContext, type Ga4PageInput } from "@/lib/ga4-page-context";

/** Guards against a second injection when the component remounts. */
let tagsLoaded = false;

type Lintrk = ((action: string, payload?: unknown) => void) & { q: unknown[][] };
type LinkedInWindow = Window & {
  _linkedin_partner_id?: string;
  _linkedin_data_partner_ids?: string[];
  lintrk?: Lintrk;
};

/**
 * Apple treats third-party tracking inside an app web view like native-app
 * tracking. ExecLingo's store shells deliberately keep those tags out: the
 * app can continue to use first-party product analytics without requiring ATT
 * or contradicting the privacy details declared in the stores.
 */
export function isStoreShellContext(
  userAgent: string = typeof navigator === "undefined" ? "" : navigator.userAgent,
  cookieHeader: string = typeof document === "undefined" ? "" : document.cookie,
): boolean {
  return userAgent.includes("ExecLingoApp")
    || userAgent.includes("ExecLingoAndroid")
    || /(?:^|;\s*)eb_app=twa(?:;|$)/.test(cookieHeader);
}

export function shouldLoadMarketingTags(
  consent: ConsentChoice | "unknown" | "ssr",
  tagsConfigured: boolean,
  storeShell: boolean,
): boolean {
  return consent === "granted" && tagsConfigured && !storeShell;
}

/**
 * Google queue bootstrap; GA4 page views are sent manually from PageView.
 * The GA4 stream must also keep Enhanced Measurement history events disabled.
 */
export function googleTagBootstrap(
  googleAdsId: string,
  analyticsId: string,
  page: Ga4PageInput,
): string {
  const pageContext = safeGa4PageContext(page);
  return (
    `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
    `gtag('js',new Date());` +
    `gtag('consent','default',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});` +
    `gtag('set',${JSON.stringify(pageContext)});` +
    (googleAdsId ? `gtag('config',${JSON.stringify(googleAdsId)});` : "") +
    (analyticsId
      ? `gtag('config',${JSON.stringify(analyticsId)},{send_page_view:false});`
      : "")
  );
}

/**
 * Loads the advertising tags. Only ever reached after an explicit yes, which
 * is why every Google consent purpose is set to granted here: the visitor has
 * already answered the question that signal exists to carry.
 */
function loadMarketingTags(): void {
  if (tagsLoaded) return;
  tagsLoaded = true;
  const { metaPixelId, googleAdsId, analyticsId, linkedinPartnerId } = marketingTags();

  // One gtag loader carries both Google tags. Either id alone is enough to
  // pull it in; whichever ids exist then get their own config line.
  if (googleAdsId || analyticsId) {
    // Install the queue before the async network file: conversion events can
    // now be accepted immediately and wait safely for Google's library.
    const inline = document.createElement("script");
    inline.text = googleTagBootstrap(
      googleAdsId,
      analyticsId,
      {
        pathname: window.location.pathname,
        search: window.location.search,
        origin: window.location.origin,
        referrer: document.referrer,
      },
    );
    document.head.appendChild(inline);

    const loader = document.createElement("script");
    loader.async = true;
    loader.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleAdsId || analyticsId)}`;
    document.head.appendChild(loader);
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

  if (linkedinPartnerId) {
    const linkedInWindow = window as LinkedInWindow;
    linkedInWindow._linkedin_partner_id = linkedinPartnerId;
    const partnerIds = linkedInWindow._linkedin_data_partner_ids ?? [];
    if (!partnerIds.includes(linkedinPartnerId)) partnerIds.push(linkedinPartnerId);
    linkedInWindow._linkedin_data_partner_ids = partnerIds;

    // Mirror LinkedIn's official queue so events can wait for the async file.
    if (!linkedInWindow.lintrk) {
      const queued = ((action: string, payload?: unknown) => {
        queued.q.push([action, payload]);
      }) as Lintrk;
      queued.q = [];
      linkedInWindow.lintrk = queued;
    }

    if (!document.getElementById("linkedin-insight-tag")) {
      const loader = document.createElement("script");
      loader.id = "linkedin-insight-tag";
      loader.type = "text/javascript";
      loader.async = true;
      loader.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
      document.head.appendChild(loader);
    }
    // The email also contains a noscript image. It is deliberately omitted:
    // unlike this loader, that image cannot be held back until consent.
  }

  // The queues above exist synchronously, even though their network files are
  // async. Consumers waiting to report a conversion can flush safely now.
  window.dispatchEvent(new Event(MARKETING_TAGS_READY_EVENT));
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
    if (shouldLoadMarketingTags(state, hasMarketingTags(), isStoreShellContext())) loadMarketingTags();
  }, [state]);

  if (state !== "unknown" || !hasMarketingTags()) return null;
  if (isStoreShellContext()) return null;

  return (
    <div className="consentBar" role="region" aria-label="Preferenze sui cookie">
      <div className="consentInner">
        <p className="consentText">
          Usiamo cookie di <strong>terze parti</strong> (Google, Meta e LinkedIn) per capire quali annunci portano persone davvero interessate.
          Sono facoltativi: se dici di no il sito funziona esattamente allo stesso modo.{" "}
          <Link href="/cookie">Quali cookie usiamo</Link>
        </p>
        <div className="consentBtns">
          <button type="button" className="consentBtn" onClick={() => remember("denied")}>Rifiuta</button>
          <button type="button" className="consentBtn consentBtnYes" onClick={() => remember("granted")}>Accetta</button>
        </div>
      </div>
    </div>
  );
}

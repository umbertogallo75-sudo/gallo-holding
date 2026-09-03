import {
  googleAdsSignupTarget,
  linkedinSignupConversionId,
  MARKETING_TAGS_READY_EVENT,
  marketingTags,
  readConsent,
} from "@/lib/consent";

/**
 * Reports a completed registration to the advertising platforms whose tags
 * are available. Those tags are loaded only after advertising consent, so an
 * absent function means the event must not be sent. First-party analytics
 * remains the source of truth for the business.
 */
type Gtag = (command: string, action: string, params?: Record<string, unknown>) => void;
type Fbq = (command: string, eventName: string, params?: Record<string, unknown>) => void;
type Lintrk = (command: "track", params: { conversion_id: number }) => void;
type TrackingWindow = Window & { gtag?: Gtag; fbq?: Fbq; lintrk?: Lintrk };

/** Once per platform and page load: a re-render must never double count. */
let googleReported = false;
let ga4Reported = false;
let metaReported = false;
let linkedinReported = false;
let retryRegistered = false;

function retryWhenTagsAreReady(): void {
  if (retryRegistered || readConsent(document.cookie) !== "granted") return;
  retryRegistered = true;
  window.addEventListener(
    MARKETING_TAGS_READY_EVENT,
    () => {
      retryRegistered = false;
      reportSignupConversion();
    },
    { once: true },
  );
}

export function reportSignupConversion(): void {
  if (typeof window === "undefined") return;

  const trackingWindow = window as TrackingWindow;
  const sendTo = googleAdsSignupTarget();
  const linkedinConversionId = linkedinSignupConversionId();
  const { analyticsId, metaPixelId, linkedinPartnerId } = marketingTags();
  const gtag = trackingWindow.gtag;

  if (!googleReported && sendTo && typeof gtag === "function") {
    try {
      gtag("event", "conversion", { send_to: sendTo });
      googleReported = true;
    } catch {
      // A campaign counter is never worth interrupting a registration for.
    }
  }

  if (!ga4Reported && analyticsId && typeof gtag === "function") {
    try {
      // GA4's recommended registration event. send_to keeps it scoped to the
      // Analytics data stream when the Google Ads tag shares the same loader.
      gtag("event", "sign_up", { send_to: analyticsId });
      ga4Reported = true;
    } catch {
      // Analytics must never be able to interrupt a successful registration.
    }
  }

  const fbq = trackingWindow.fbq;
  if (!metaReported && metaPixelId && typeof fbq === "function") {
    try {
      fbq("track", "CompleteRegistration");
      metaReported = true;
    } catch {
      // A campaign counter is never worth interrupting a registration for.
    }
  }

  const lintrk = trackingWindow.lintrk;
  if (
    !linkedinReported &&
    linkedinPartnerId &&
    linkedinConversionId &&
    typeof lintrk === "function"
  ) {
    try {
      lintrk("track", { conversion_id: linkedinConversionId });
      linkedinReported = true;
    } catch {
      // A campaign counter is never worth interrupting a registration for.
    }
  }

  // OAuth returns can mount before the consent component has installed the
  // queues. Retry only when consent already existed: a later yes must never
  // make a conversion that happened before consent leave the browser.
  if (
    (sendTo && !googleReported) ||
    (analyticsId && !ga4Reported) ||
    (metaPixelId && !metaReported) ||
    (linkedinPartnerId && linkedinConversionId && !linkedinReported)
  ) {
    retryWhenTagsAreReady();
  }
}

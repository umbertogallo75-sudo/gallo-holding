import { googleAdsSignupTarget } from "@/lib/consent";

/**
 * Reports a completed registration to the advertising platforms whose tags
 * are available. Those tags are loaded only after advertising consent, so an
 * absent function means the event must not be sent. First-party analytics
 * remains the source of truth for the business.
 */
type Gtag = (command: string, action: string, params?: Record<string, unknown>) => void;
type Fbq = (command: string, eventName: string, params?: Record<string, unknown>) => void;

/** Once per platform and page load: a re-render must never double count. */
let googleReported = false;
let metaReported = false;

export function reportSignupConversion(): void {
  if (typeof window === "undefined") return;

  const trackingWindow = window as unknown as { gtag?: Gtag; fbq?: Fbq };
  const sendTo = googleAdsSignupTarget();
  const gtag = trackingWindow.gtag;

  if (!googleReported && sendTo && typeof gtag === "function") {
    try {
      gtag("event", "conversion", { send_to: sendTo });
      googleReported = true;
    } catch {
      // A campaign counter is never worth interrupting a registration for.
    }
  }

  const fbq = trackingWindow.fbq;
  if (!metaReported && typeof fbq === "function") {
    try {
      fbq("track", "CompleteRegistration");
      metaReported = true;
    } catch {
      // A campaign counter is never worth interrupting a registration for.
    }
  }
}

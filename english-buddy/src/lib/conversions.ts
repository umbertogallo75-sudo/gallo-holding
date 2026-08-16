import { googleAdsSignupTarget } from "@/lib/consent";

/**
 * Reports a completed registration to Google Ads.
 *
 * Only fires when the visitor accepted the advertising cookies, because
 * `gtag` simply does not exist otherwise — the tag is never loaded without a
 * yes. That is not a limitation to work around: it means Google will always
 * count fewer registrations than the admin dashboard does, and the first-party
 * funnel stays the number to trust. Google's copy exists to steer the bidding,
 * not to measure the business.
 */

type Gtag = (command: string, action: string, params?: Record<string, unknown>) => void;

/** Once per page load: a re-render must never report a second signup. */
let reported = false;

export function reportSignupConversion(): void {
  if (typeof window === "undefined" || reported) return;
  const sendTo = googleAdsSignupTarget();
  if (!sendTo) return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag !== "function") return;
  reported = true;
  try {
    gtag("event", "conversion", { send_to: sendTo });
  } catch {
    // A campaign counter is never worth interrupting a registration for.
  }
}
